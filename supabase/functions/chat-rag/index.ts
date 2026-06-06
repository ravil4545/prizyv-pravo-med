import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { llmChat, MODEL_MAIN, isLlmConfigured } from "../_shared/llmGateway.ts";
import { searchHybrid, renderChunks, KNOWLEDGE_CATEGORIES } from "../_shared/ragSearch.ts";

// ─── CORS (same pattern as other functions in this project) ──────────────────
const getAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get("origin") || "";
  if (origin === "https://nepriziv.ru" || origin === "https://www.nepriziv.ru") return origin;
  if (origin.endsWith(".lovable.app")) return origin;
  if (origin.startsWith("http://localhost")) return origin;
  return origin || "*";
};

const getCorsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

// ─── Clients ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const JINA_KEY = Deno.env.get("JINA_API_KEY");
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

// ─── System context cache (warm on cold start, refreshes each ~24h deploy) ───
let cachedSystemContext: string | null = null;

async function getSystemContext(): Promise<string> {
  if (cachedSystemContext) return cachedSystemContext;

  const ORDER = [
    "рамка_консультации",
    "медицинские_тонкости",
    "процедурные_тонкости",
    "диагностический_анализ",
    "правила_улучшения",
  ];

  const { data, error } = await supabase
    .from("rag_system_context")
    .select("name, content")
    .in("name", ORDER);

  if (error) throw new Error(`Ошибка загрузки системного контекста: ${error.message}`);
  if (!data?.length) {
    throw new Error(
      "Системный контекст пуст. Запустите python scripts/ingest_rag.py"
    );
  }

  // Обрезаем каждый блок: суммарный system-context разросся (>47k символов),
  // что вместе с retrieved-чанками превышало лимит запроса к LLM (413).
  const BLOCK_CAP = 2500;
  const map = Object.fromEntries(data.map((r) => [r.name, r.content]));
  cachedSystemContext = ORDER
    .filter((n) => map[n])
    .map((n) => {
      const c = map[n].length > BLOCK_CAP ? map[n].slice(0, BLOCK_CAP) + "…" : map[n];
      return `### ${n}\n\n${c}`;
    })
    .join("\n\n---\n\n");

  return cachedSystemContext;
}

// ─── Jina AI embeddings (jina-embeddings-v3, 1024 dims, strong Russian support) ─
// task по умолчанию retrieval.passage — симметрично инжесту (ingest_rag.py).
// Асимметрия query/passage на этой базе давала низкую similarity и мусор.
async function embed(text: string, task: "retrieval.query" | "retrieval.passage" = "retrieval.passage"): Promise<number[]> {
  if (!JINA_KEY) throw new Error("JINA_API_KEY не настроен");

  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      task,
      dimensions: 1024,
      input: [text.slice(0, 8000)],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina embeddings error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.data[0].embedding as number[];
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!JINA_KEY || !isLlmConfigured()) {
      return Response.json(
        { error: !JINA_KEY ? "JINA_API_KEY не настроен" : "OPENAI_API_KEY не настроен" },
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

    // 1-2. Гибридный поиск по базе знаний (keyword + вектор) — устойчивее
    // чистого вектора на русских мед-текстах (низкая дискриминация Jina v3).
    // Чанки обрезаются (1600), чтобы таблицы степеней/порогов не резались на половине.
    const chunks = await searchHybrid(supabase, message, {
      matchCount: 6,
      categories: KNOWLEDGE_CATEGORIES, // публичный виджет — только выверенные знания, без сырой практики
    });
    const retrievedContext = renderChunks(chunks, 1600);

    // 3. Load foundational system context (cached after first call)
    const sysCtx = await getSystemContext();

    // System prompt — included in every OpenAI request
    const systemText =
      `Ты — специализированный AI-помощник сайта nepriziv.ru. Помогаешь призывникам разобраться в военно-медицинской экспертизе и юридических процедурах призыва в РФ.

ПРАВИЛА:
- ГЛАВНЫЙ ИСТОЧНИК — блок «НАЙДЕННЫЕ МАТЕРИАЛЫ ПО ТЕМЕ» в сообщении пользователя. Отвечай строго по нему; общая «База знаний» ниже — только фон.
- ВСЕ ЧИСЛА И ПОРОГИ (градусы, диоптрии, мм, степени/стадии, номера статей и пунктов, категории) бери ДОСЛОВНО из «Найденных материалов». НИКОГДА не указывай числовые границы по памяти.
- Если в материалах есть таблица степеней/категорий — определяй степень и категорию СТРОГО по диапазону из таблицы, не сдвигая и не округляя границы (например, значение на границе диапазона относится к тому диапазону, где оно явно указано).
- Если нужного числа/порога в материалах НЕТ — честно скажи, что нужно уточнить, и предложи консультацию. НЕ придумывай числа и не бери их «из общих знаний».
- Конкретно указывай статьи Расписания болезней (ПП РФ №565) и нормы ФЗ-53
- Если нужной информации нет — честно скажи и предложи личную консультацию: +7 (925) 350-05-33
- Язык: русский, понятный призывнику 18 лет, без юридического жаргона
- НЕ указывай проценты ("шанс 75%") — только факты: "при данном диагнозе положена категория В"
- Ты справочный ИИ, НЕ лицензированный юрист и НЕ ВВК; окончательное решение о годности принимает ВВК. Гарантий исхода не давай.
- В конце каждого ответа: ⚠️ Это справочная информация, не замена юридической консультации

ФОРМАТ (стиль Telegram/WhatsApp):
- Разбивай ответ на смысловые блоки через ---
- **Жирный** только для: диагнозов, категорий годности, статей расписания
- Один блок = одна мысль, 300–600 символов

--- БАЗА ЗНАНИЙ ---

${sysCtx}`;

    // User turn: retrieved chunks + actual question
    const userContent = retrievedContext
      ? `НАЙДЕННЫЕ МАТЕРИАЛЫ ПО ТЕМЕ (это основной источник; числа, степени, категории и статьи бери дословно отсюда):\n\n${retrievedContext}\n\n---\n\nВопрос: ${message}`
      : `Вопрос: ${message}`;

    // 4. Текстовый LLM через единый OpenAI LLMGateway.
    const aiRes = await llmChat({
      // 70b-модель (TPM 12000) вместо 8b (TPM 6000): база знаний + system-context
      // в одном запросе не влезали в лимит малой модели.
      model: MODEL_MAIN,
      stream: true,
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

    // 5. Stream response back to the client
    return new Response(aiRes.body, {
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
