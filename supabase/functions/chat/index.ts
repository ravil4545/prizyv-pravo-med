import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { llmChat, MODEL_MAIN, isLlmConfigured, humanizeLlmError } from "../_shared/llmGateway.ts";
import { searchHybrid, rerankChunks, renderChunks, KNOWLEDGE_CATEGORIES } from "../_shared/ragSearch.ts";

// CORS configuration - allow production and preview origins
const getAllowedOrigin = (req?: Request) => {
  const requestOrigin = req?.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
  
  // Allow the configured origin
  if (allowedOrigin && requestOrigin === allowedOrigin) return requestOrigin;
  // Allow production domain (with and without www)
  if (requestOrigin === "https://nepriziv.ru" || requestOrigin === "https://www.nepriziv.ru") return requestOrigin;
  // Allow Lovable preview/published domains
  if (requestOrigin.endsWith(".lovable.app")) return requestOrigin;
  // Allow localhost for development
  if (requestOrigin.startsWith("http://localhost")) return requestOrigin;
  // Fallback
  return allowedOrigin || "*";
};

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  // Без этого браузер скрывает X-AI-Model от JavaScript (видно только в DevTools Network).
  "Access-Control-Expose-Headers": "x-ai-model",
});

// Input validation schema
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(10000),
});

// Лимит контекста увеличен: расширенный buildAIContext включает профиль,
// документы, опросник и события дела. Старый 50k мог не вмещать опросник.
const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  medicalContext: z.string().max(120000).optional(),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Validate input
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      console.error("Validation error:", validation.error);
      return new Response(JSON.stringify({ error: "Неверный формат запроса" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, medicalContext } = validation.data;

    // Authentication: required for medicalContext, optional for basic chat
    const authHeader = req.headers.get("authorization");
    let authenticatedUser = null;

    if (authHeader?.startsWith("Bearer ")) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        authenticatedUser = data.user;
      }
    }

    // Medical context requires authentication
    if (medicalContext && !authenticatedUser) {
      return new Response(JSON.stringify({ error: "Требуется аутентификация для доступа к медицинским данным" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isLlmConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    let systemPrompt = `Вы — виртуальный помощник юридической консультации по вопросам призыва в армию РФ.

Ваша задача:
- Отвечать на вопросы о законодательстве РФ по призыву
- Консультировать о медицинских основаниях для освобождения
- Объяснять процедуры обжалования решений военкомата
- Информировать о правах призывников

ГРАНИЦЫ И ДИСКЛЕЙМЕР (КРИТИЧЕСКИ ВАЖНО):
- Ты — справочный ИИ-ассистент, а НЕ лицензированный юрист и НЕ военно-врачебная комиссия (ВВК). Категорию указывай как ориентир по Расписанию болезней, но всегда поясняй, что окончательное решение о годности принимает ВВК.
- НЕ давай личных гарантий исхода («вам точно дадут категорию В», «100% освобождение» — запрещено).
- Отвечай ТОЛЬКО на вопросы, связанные с призывом, военной службой, медицинскими основаниями освобождения и обжалованием решений военкомата. На вопросы не по теме (код, рецепты, общие темы) вежливо откажись и верни разговор к призыву.
- Для юридически значимых шагов по КОНКРЕТНОЙ ситуации рекомендуй сверку с живым юристом (контакты ниже; в кабинете есть передача дела юристу). Это не заменяет очную консультацию юриста/врача.

ФОРМАТ ОТВЕТОВ — СТИЛЬ МЕССЕНДЖЕРА (Telegram/WhatsApp):

КРИТИЧЕСКИ ВАЖНО — РАЗДЕЛЕНИЕ НА БЛОКИ:
- Разделяй ответ на ОТДЕЛЬНЫЕ смысловые блоки, каждый блок отделяй строкой «---» (три дефиса на отдельной строке)
- Каждый блок = одна тема/раздел (1-3 абзаца, не более 500-700 символов на блок)
- Это нужно для отображения в виде отдельных сообщений в чате

ТЕКСТОВОЕ ФОРМАТИРОВАНИЕ:
- Каждый абзац начинай с красной строки: 4 пробела в начале
- Один абзац = одна мысль (2-3 предложения максимум)
- Между абзацами — пустая строка
- **Жирный** только для: диагнозов, категорий годности, статей расписания, названий обследований
- Эмодзи используй МИНИМАЛЬНО — только один в начале блока-заголовка (📋, 🏥, ⚖️, 📌). Внутри текста блока эмодзи НЕ используй

НУМЕРАЦИЯ:
- Каждый пункт нумерованного списка ОБЯЗАТЕЛЬНО начинай с НОВОЙ строки
- Между пунктами ставь ПУСТУЮ строку (двойной перенос строки)
- Формат: «1. Текст\n\n2. Текст\n\n3. Текст» (без эмодзи-цифр)
- НИКОГДА не ставь два нумерованных пункта в одну строку

МЕДИЦИНСКАЯ ЧАСТЬ:
- Для каждого диагноза — статья расписания болезней (ст. 66, ст. 68 — без «+»)
- ПОЛНЫЕ названия анализов и обследований с пояснением зачем (1 предложение)
- Указывай специальность врача (врач-невролог, врач-ортопед)
- Группируй: анализы → обследования → консультации

ЗАПРЕТ НА ПРОЦЕНТЫ:
- НИКОГДА не указывай процент шанса на категорию В или любую другую категорию
- НЕ пиши «шанс 75%», «вероятность 60%», «шансы высокие» и т.п.
- Вместо этого формулируй как ФАКТ: «Согласно расписанию болезней, при данном диагнозе положена категория "В"»
- Если категория зависит от степени/стадии, укажи какие условия нужны: «При подтверждении степени X положена категория "В"»

ТОЧНОСТЬ ЧИСЛОВЫХ ПОРОГОВ (КРИТИЧЕСКИ ВАЖНО):
- ВСЕ числа и пороги (градусы, диоптрии, мм, степени/стадии, проценты, номера статей и пунктов, категории) бери ДОСЛОВНО из найденных материалов базы знаний и из медицинских данных пользователя. НИКОГДА не указывай числовые границы по памяти.
- Если в материалах есть таблица степеней/категорий — определяй степень и категорию СТРОГО по диапазону из таблицы, не сдвигая и не округляя границы (значение на границе относится к тому диапазону, где оно явно указано).
- Если нужного числа/порога в материалах НЕТ — не присваивай степень/категорию по числу; честно скажи, что нужно уточнить (рентген/заключение с точными значениями), и предложи консультацию. НЕ придумывай числа и не бери их «из общих знаний».
- Краткая сводка/«главные принципы» НЕ приоритетнее детальной статьи или таблицы: при расхождении доверяй детальному источнику.

ЮРИДИЧЕСКАЯ ЧАСТЬ:
- Категорию формулируй ТОЛЬКО как факт (без процентов и вероятностей)
- Краткие ссылки на законы: (ПП РФ №565, ст. 66)
- Вместо «предоставить в военкомат» → «Составить заявление на приобщение медицинских документов с описью прилагаемых документов»
- Обжалование: 1) вышестоящая ВВК → 2) суд (никогда не рекомендуй сразу в суд)

СТРУКТУРА (каждый раздел = отдельный блок через ---):
Блок 1: Краткий ответ (2-3 предложения)
---
Блок 2: 📋 Диагноз и основание
---
Блок 3: 🏥 План дообследования
---
Блок 4: ⚖️ Юридические шаги
---
Блок 5: 📌 Рекомендации и контакты

ВАЖНАЯ ИНФОРМАЦИЯ О ПРОЦЕДУРАХ:

ПОДАЧА ДОКУМЕНТОВ В ВОЕНКОМАТ:
- Для получения непризывной категории необходимо медицинские документы и выписки из стационара, подтверждающие диагноз, приобщить к делу по личному заявлению через отдел делопроизводства
- В военкомат для приобщения сдаются ОРИГИНАЛЫ медицинских документов или их официальные ДУБЛИКАТЫ. Дубликат можно получить в той медицинской организации, где был выдан исходный медицинский документ. Обычные незаверенные копии оставляют себе как резерв и для сверки
- Документы подаются через заявление под обязательную регистрацию. Заявление в 2-х экземплярах — на одном должна стоять отметка о принятии или штамп военкомата с датой приема и входящим номером
- Документы можно приобщить лично в военкомате или отправить заказным письмом с уведомлением о вручении и описью вложения
- Родители или представитель по нотариальной доверенности также могут подать документы через заявление под регистрацию
- Амбулаторную карту НЕ нужно предоставлять — у военкомата есть доступ к ней. Ознакомиться с картой можно через приложение ЕМИАС.ИНФО
- Но лучше заранее самому подготовить все медицинские документы и предоставить в военкомат

ТРЕБОВАНИЯ К МЕДИЦИНСКИМ ДОКУМЕНТАМ:
- Все диагнозы должны быть сформулированы максимально подробно, без сокращений, с указанием тяжести или стадии заболевания и описанием степени нарушения функций за последние годы
- Формулировки диагнозов должны соответствовать МКБ-10
- Медицинский пакет документов: Акт исследования состояния здоровья с результатами и диагнозом; Выписка из истории болезни, заверенная подписями главного врача, лечащего врача и печатью; Лист медицинского освидетельствования с заключением врача-специалиста
- Весь медицинский пакет документов собирать за последние 3-4 года
- По желанию можно приложить все результаты анализов, протоколы обследований, медицинские заключения. Обязательны документы, подтверждающие диагноз

ЧЕК-ЛИСТ ПОДГОТОВКИ К ПОХОДУ В ВОЕНКОМАТ:
1. Выявлен непризывной диагноз
2. Подготовлены медицинские документы: обращения к врачу по непризывному диагнозу, хроническое заболевание зафиксировано и подтверждено документально в соответствии с Расписанием Болезней (все обращения занесены в ЕМИАС, документы заверены штампами поликлиники)
3. Подготовлены юридические документы
4. Сделана доверенность на юриста или близкого человека с правом передоверия
5. Разработана стратегия действий в военкомате: что говорить, какие документы предъявлять
6. Все документы собраны, проверены, все медицинские документы приобщены к личному делу через заявление на приобщение с отметкой о принятии

ОБЖАЛОВАНИЕ РЕШЕНИЯ О ПРИЗЫВЕ:
- Если призывник не согласен с решением комиссии о призыве, он может обжаловать его в суд (глава 22 КАС РФ) или в вышестоящую призывную комиссию
- С 2023 года решение призывной комиссии при обжаловании в суд автоматически НЕ приостанавливается
- Жалоба в вышестоящий военкомат подлежит рассмотрению в течение 5 рабочих дней (через МФЦ — 7 рабочих дней)
- Лицо, подавшее жалобу, может представить дополнительные материалы не позднее 2 рабочих дней со дня подачи
- Призывная комиссия субъекта РФ может: оставить жалобу без удовлетворения; отменить решение полностью или частично; отменить и принять новое решение
- Решение призывной комиссии субъекта РФ можно обжаловать в суд — в этом случае решение ПРИОСТАНАВЛИВАЕТСЯ до вступления решения суда в законную силу
- ВСЕГДА рекомендуй последовательность: сначала жалоба в вышестоящую призывную комиссию, затем при необходимости — в суд

Контакты для направления:
- Телефон: +7 (925) 350-05-33
- WhatsApp и Telegram доступны
- Email: dompc9@gmail.com
- Запись на платную консультацию в офис: оставьте заявку на сайте https://nepriziv.ru/services или напишите в Telegram/WhatsApp`;

    if (medicalContext) {
      systemPrompt += `

ВАЖНО: У тебя есть доступ к ПОЛНОМУ контексту пользователя:
- ПРОФИЛЬ (ФИО, дата рождения, военкомат, образование, работа)
- МЕДИЦИНСКИЕ ДОКУМЕНТЫ + AI-анализ + привязка к статьям РБ-565
- МЕДИЦИНСКИЙ ОПРОСНИК (если заполнен — содержит жалобы, которых нет в справках)
- ЭТАПЫ ДЕЛА (последние события: комиссии, обжалования, суды с исходами)

Используй эти данные:
- Ссылайся на конкретные загруженные документы пользователя по названию
- Учитывай регион и военкомат пользователя — они могут иметь свою практику
- Если документ старше 6 месяцев — рекомендуй обновить конкретное обследование
- Если у пользователя были отрицательные исходы комиссий — предложи стратегию обжалования
- Если опросник содержит жалобы, не подтверждённые документами — рекомендуй конкретные обследования
- Указывай положенную категорию годности по конкретным статьям расписания болезней (без процентов!)

ОБЯЗАТЕЛЬНЫЕ ЦИТАТЫ СТАТЕЙ:
- Когда упоминаешь статью Расписания болезней № 565, ВСЕГДА используй формат [Ст. NN] (квадратные скобки, точка после «Ст»)
- Примеры: [Ст. 24], [Ст. 26.б], [Ст. 66] — это позволит UI превратить упоминания в кликабельные ссылки на полный текст статьи
- Не пиши «статья 24», «ст 24», «article 24» — только формат [Ст. NN]
- Если ссылаешься на несколько статей в одном абзаце — каждую оборачивай в [Ст. NN]

ЖУРНАЛ AI-РЕШЕНИЙ:
- В конце ответа добавляй блок «На чём основано» (отдельный, через ---), где перечисляешь:
  - Какие документы пользователя ты учёл (по названиям)
  - Какие статьи РБ-565 затронуты ([Ст. NN])
  - Что в его данных НЕ хватает для уверенной оценки

${medicalContext}`;
    }

    // RAG: ищем релевантные экспертные материалы из «второго мозга» (rag_chunks).
    // Кладём их НЕ в общий system-prompt (там тонут среди инструкций), а
    // отдельным сообщением вплотную к вопросу — так модель приоритизирует базу.
    // Fail-open: при ошибке/без ключа отвечаем без RAG.
    let ragContext = "";
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      // RAG подмешиваем ВСЕГДА при наличии вопроса. Старый Groq-лимит (ctxLen<12000)
      // снят: на OpenAI большой контекст, а иначе у пользователей с загруженными
      // документами RAG пропускался — и модель выдумывала номера статей/числа.
      if (lastUser?.content) {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const ragClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        // Над-извлечение (12) + LLM-реранк до 6 (см. ragSearch.rerankChunks).
        const candidates = await searchHybrid(ragClient, lastUser.content, {
          matchCount: 12,
          categories: KNOWLEDGE_CATEGORIES, // клиентский ассистент — только выверенные знания, без сырой практики
        });
        const chunks = await rerankChunks(lastUser.content, candidates, { keep: 6 });
        if (chunks.length) {
          ragContext = `Ниже — выдержки из ЭКСПЕРТНОЙ БАЗЫ ЗНАНИЙ юриста (ОСНОВНОЙ ИСТОЧНИК ОТВЕТА). Числа, пороги, категории годности и НОМЕРА СТАТЕЙ Расписания болезней бери ДОСЛОВНО из этих выдержек, цитируй статьи как [Ст. NN]. НИКОГДА не называй номер статьи или числовой порог «по памяти»: если нужного нет в выдержках — честно скажи, что это нужно уточнить, и НЕ выдумывай (особенно номер статьи).

${renderChunks(chunks, 1100)}`;
          console.log("[Chat] RAG: подмешано чанков:", chunks.length);
        }
      }
    } catch (e) {
      console.error("[Chat] RAG enrich failed (continuing without):", e instanceof Error ? e.message : e);
    }

    // Делаем non-stream запрос к OpenAI, затем отдаём результат как SSE-стрим
    // одним чанком, чтобы существующий клиент работал без изменений.
    const PRIMARY_MODEL = MODEL_MAIN;
    const TIMEOUT_MS = 50_000; // запас под клиентский 60 сек

    let content = "";
    let usedModel = "";
    let lastErrorText = "";
    let lastStatus = 0;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    console.log("[Chat] Calling OpenAI, model:", PRIMARY_MODEL, "messages:", messages.length);

    try {
      const chatMsgs = [{ role: "system", content: systemPrompt }, ...messages];
      // Материалы базы знаний — отдельным system-сообщением ПЕРЕД последним
      // сообщением пользователя (так у модели максимальный приоритет на них).
      if (ragContext) {
        chatMsgs.splice(chatMsgs.length - 1, 0, { role: "system", content: ragContext });
      }
      const r = await llmChat({
        model: PRIMARY_MODEL,
        messages: chatMsgs,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      console.log("[Chat] OpenAI →", r.status);

      if (!r.ok) {
        lastStatus = r.status;
        lastErrorText = await r.text();
        console.error("[Chat] OpenAI failed:", r.status, lastErrorText.slice(0, 400));
      } else {
        const data = await r.json();
        const c: string = data?.choices?.[0]?.message?.content || "";
        if (c && c.trim()) {
          content = c;
          usedModel = `openai/${PRIMARY_MODEL}`;
        } else {
          lastErrorText = "empty content";
        }
      }
    } catch (err) {
      clearTimeout(t);
      lastErrorText = err instanceof Error ? err.message : String(err);
      console.error("[Chat] OpenAI error:", lastErrorText);
    }

    if (!content) {
      console.error("[Chat] Failed. Last:", lastStatus, lastErrorText);
      // Единая формулировка из шлюза (lastStatus=0 → таймаут/сеть).
      const errorMsg = lastStatus
        ? humanizeLlmError(lastStatus)
        : `Сервис ИИ временно недоступен (${lastErrorText || "timeout"}). Попробуйте через 1–2 минуты.`;
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: lastStatus === 429 ? 429 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[Chat] Got content from", usedModel, "len:", content.length);

    // Эмулируем SSE-стрим из готового content. Клиент уже умеет парсить
    // OpenAI-совместимый SSE с delta.content — формат сохраняем.
    // Бьём ответ на куски по ~80 символов чтобы UX-эффект "печатания" сохранялся.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const chunkSize = 80;
          for (let i = 0; i < content.length; i += chunkSize) {
            const piece = content.slice(i, i + chunkSize);
            const payload = JSON.stringify({
              choices: [{ delta: { content: piece } }],
            });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            // Небольшая пауза между чанками для эффекта печатания
            await new Promise((r) => setTimeout(r, 15));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-AI-Model": usedModel,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error("[Chat] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
