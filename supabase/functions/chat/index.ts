import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
});

// Input validation schema
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(10000),
});

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  medicalContext: z.string().max(50000).optional(),
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

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    let systemPrompt = `Вы — виртуальный помощник юридической консультации по вопросам призыва в армию РФ.

Ваша задача:
- Отвечать на вопросы о законодательстве РФ по призыву
- Консультировать о медицинских основаниях для освобождения
- Объяснять процедуры обжалования решений военкомата
- Информировать о правах призывников

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
- В военкомат сдаются ОРИГИНАЛЫ документов
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
- Запись на платную консультацию в офис: https://nepriziv.ru/?page_id=81`;

    if (medicalContext) {
      systemPrompt += `

ВАЖНО: У тебя есть доступ к медицинским данным пользователя. Это его реальные загруженные документы и их AI-анализ.
Используй эти данные при ответах:
- Ссылайся на конкретные загруженные документы пользователя
- Если документ старше 6 месяцев — рекомендуй обновить конкретное обследование (указывай полное название)
- Указывай положенную категорию годности по конкретным статьям расписания болезней (без процентов!)
- Рекомендуй недостающие обследования с полными названиями и пояснением зачем они нужны
- Если по какой-то статье нет документов — предложи конкретный план обследований

${medicalContext}`;
    }

    console.log("[Chat] Calling OpenRouter with model nvidia/nemotron-3-super-120b-a12b:free, messages:", messages.length);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nepriziv.ru",
        "X-Title": "nepriziv.ru Legal Chat",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    console.log("[Chat] OpenRouter response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Chat] AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов. Пожалуйста, попробуйте позже." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Требуется пополнение счета." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `Ошибка сервиса AI: ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
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
