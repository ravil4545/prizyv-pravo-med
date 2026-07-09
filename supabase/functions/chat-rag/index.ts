import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { isLlmConfigured, llmChat, MODEL_MAIN } from "../_shared/llmGateway.ts";
import {
  extractArticleNumbers,
  KNOWLEDGE_CATEGORIES,
  renderChunks,
  rerankChunks,
  searchHybrid,
  traceRagChunks,
} from "../_shared/ragSearch.ts";
import { getRagAnswerPolicy } from "../_shared/ragPolicy.ts";
import {
  captureStreamUsageAndRecord,
  checkAnonRateLimit,
  getClientIp,
  hashIp,
  waitUntil,
} from "../_shared/aiUsage.ts";

// Публичный виджет — самый большой анонимный анти-абьюз-риск (без логина,
// без аккаунта на который вешать ₽-бюджет). Единственная защита — IP-лимит
// в сутки + жёсткий потолок вывода/истории (см. запрос ниже).
const CHAT_RAG_MAX_PER_DAY = Number(Deno.env.get("CHAT_RAG_MAX_PER_DAY")) || 20;
const CHAT_RAG_MAX_TOKENS = Number(Deno.env.get("CHAT_RAG_MAX_TOKENS")) || 1000;

// ─── CORS (same pattern as other functions in this project) ──────────────────
const getAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get("origin") || "";
  if (
    origin === "https://nepriziv.ru" || origin === "https://www.nepriziv.ru"
  ) return origin;
  if (origin.endsWith(".lovable.app")) return origin;
  if (origin.startsWith("http://localhost")) return origin;
  return origin || "*";
};

const getCorsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
});

// ─── Clients ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Текстовый агент (RAG-виджет) идёт через единый OpenAI LLMGateway.
// Vision не нужен — это чисто текстовый RAG-чат по базе знаний.

// ─── Input schema ─────────────────────────────────────────────────────────────
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const requestSchema = z.object({
  message: z.string().min(2).max(4000),
  history: z.array(messageSchema).max(10).optional().default([]),
});

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isLlmConfigured()) {
      return Response.json(
        { error: "OPENAI_API_KEY не настроен" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Неверный JSON в запросе" },
        { status: 400, headers: corsHeaders },
      );
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Некорректный запрос", details: parsed.error.issues },
        { status: 400, headers: corsHeaders },
      );
    }

    const { message, history } = parsed.data;

    // Rate-limit по IP ДО дорогого поиска/вызова LLM — публичный виджет без
    // логина, единственная защита от скриптового абьюза.
    const ipHash = await hashIp(getClientIp(req));
    const allowed = await checkAnonRateLimit(
      supabase,
      "chat-rag",
      ipHash,
      CHAT_RAG_MAX_PER_DAY,
    );
    if (!allowed) {
      return Response.json(
        {
          error:
            "Слишком много вопросов с вашего IP за сегодня. Попробуйте завтра или зарегистрируйтесь — там свой лимит.",
        },
        { status: 429, headers: corsHeaders },
      );
    }

    // 1-2. Гибридный поиск по базе знаний (keyword + вектор) — устойчивее
    // чистого вектора на русских мед-текстах (низкая дискриминация Jina v3).
    // Чанки обрезаются (1600), чтобы таблицы степеней/порогов не резались на половине.
    // Над-извлечение (12) + LLM-реранк до 6: гибрид даёт кандидатов, реранкер
    // отсекает поверхностно похожие, чтобы модель не отвлекалась на нерелевантное.
    const articles = extractArticleNumbers(message);
    const candidates = await searchHybrid(supabase, message, {
      matchCount: 12,
      categories: KNOWLEDGE_CATEGORIES, // публичный виджет — только выверенные знания, без сырой практики
      articles: articles.length ? articles : undefined,
    });
    const chunks = await rerankChunks(message, candidates, { keep: 6 });
    traceRagChunks("chat-rag", chunks);
    const retrievedContext = renderChunks(chunks, 1600);

    // 3. Compact canonical answer policy shared by all RAG consumers.
    const sysCtx = await getRagAnswerPolicy(supabase);

    // System prompt — included in every OpenAI request
    const systemText =
      `Ты — специализированный AI-помощник сайта nepriziv.ru. Помогаешь призывникам разобраться в военно-медицинской экспертизе и юридических процедурах призыва в РФ.

ПРАВИЛА:
- ГЛАВНЫЙ ИСТОЧНИК — блок «ВНУТРЕННИЙ ЭКСПЕРТНЫЙ КОНТЕКСТ» в сообщении пользователя. Единая политика ответа ниже обязательна для структуры, приоритетов и краткости.
- Внутренний контекст и база знаний НЕ видны клиенту. Никогда не пиши клиенту: «в материалах», «в найденных материалах», «в базе знаний», «вы загрузили документы», «в предоставленных документах», если клиент реально не прикладывал документы в этом чате.
- ВСЕ ЧИСЛА И ПОРОГИ (градусы, диоптрии, мм, степени/стадии, номера статей и пунктов, категории) бери ДОСЛОВНО из внутреннего экспертного контекста. НИКОГДА не указывай числовые границы по памяти.
- Если во внутреннем контексте есть таблица степеней/категорий — определяй степень и категорию СТРОГО по диапазону из таблицы, не сдвигая и не округляя границы (например, значение на границе диапазона относится к тому диапазону, где оно явно указано).
- Если нужного числа/порога во внутреннем контексте НЕТ — честно скажи, что нужно уточнить, и предложи консультацию. НЕ придумывай числа и не бери их «из общих знаний».
- Конкретно указывай статьи Расписания болезней (ПП РФ №565) и нормы ФЗ-53
- Если нужной информации нет — коротко назови недостающий факт. Личную консультацию предлагай только когда без неё нельзя определить следующий юридически значимый шаг.
- Язык: русский, понятный призывнику 18 лет, без юридического жаргона
- Первое сообщение клиента считай первичным обращением, если из истории не видно обратного. Начинай с приличного короткого приветствия: «Здравствуйте!» или «Добрый день!».
- Давай практичный вывод сразу: какая статья/норма, какая категория или юридический риск возможны, что усиливает позицию, что ослабляет и что делать дальше.
- Если клиент спрашивает про шанс/перспективу/«берут ли»/«получу ли категорию», дай ориентировочную оценку в процентах диапазоном. Связывай проценты с условиями: подтверждено документами, нужна дофиксация, есть риск занижения.
- Не начинай ответ с очевидного дисклеймера «решение принимает ВВК/комиссия». Упоминай комиссию, ВВК или военкомат только там, где это нужно для конкретного действия клиента.
- Не выдумывай учреждения и процедуры. Если не уверен в конкретном учреждении, пиши нейтрально: «профильный врач», «профильная медицинская организация», «стационар», «юрист по призывному праву».
- Ты справочный ИИ юридической консультации. Гарантий исхода не давай.
- Не добавляй одинаковый дисклеймер и контакты в каждый ответ.

ФОРМАТ:
- Не более трёх коротких смысловых блоков; разделитель --- используй только при необходимости
- **Жирный** только для: диагнозов, категорий годности, статей расписания
- Один блок = одна мысль; не повторяй вывод другими словами

--- ЕДИНАЯ ПОЛИТИКА ОТВЕТА ---

${sysCtx}`;

    // User turn: retrieved chunks + actual question
    const userContent = retrievedContext
      ? `ВНУТРЕННИЙ ЭКСПЕРТНЫЙ КОНТЕКСТ (это основной источник; числа, степени, категории и статьи бери дословно отсюда; клиенту не упоминать сам факт этого блока):\n\n${retrievedContext}\n\n---\n\nВопрос: ${message}`
      : `Вопрос: ${message}`;

    // 4. Текстовый LLM через единый OpenAI LLMGateway.
    const aiRes = await llmChat({
      // 70b-модель (TPM 12000) вместо 8b (TPM 6000): база знаний + system-context
      // в одном запросе не влезали в лимит малой модели.
      model: MODEL_MAIN,
      stream: true,
      trackUsage: true,
      maxTokens: CHAT_RAG_MAX_TOKENS,
      messages: [
        { role: "system", content: systemText },
        // Conversation history (last 6 turns to keep context manageable)
        ...history.slice(-6),
        { role: "user", content: userContent },
      ],
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[chat-rag] OpenAI error:", aiRes.status, errText);

      if (aiRes.status === 429) {
        return Response.json(
          { error: "Превышен лимит запросов. Попробуйте через минуту." },
          { status: 429, headers: corsHeaders },
        );
      }

      return Response.json(
        { error: `Ошибка AI-сервиса: ${aiRes.status}` },
        { status: 500, headers: corsHeaders },
      );
    }

    // 5. Stream response back to the client — вторая половина tee() читается
    // в фоне для учёта расхода (см. _shared/aiUsage.ts), клиента не задерживает.
    const [clientStream, usageStream] = aiRes.body!.tee();
    waitUntil(captureStreamUsageAndRecord(usageStream, supabase, {
      functionName: "chat-rag",
      ipHash,
      userId: null,
      model: MODEL_MAIN,
    }));

    return new Response(clientStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[chat-rag] Unexpected error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Неизвестная ошибка" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
});
