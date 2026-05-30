import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

const JINA_KEY        = Deno.env.get("JINA_API_KEY");
// Единый ИИ-провайдер с основным чатом — Lovable AI Gateway (Gemini),
// надёжнее бесплатного nemotron (OpenRouter часто отдавал 429).
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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

  const map = Object.fromEntries(data.map((r) => [r.name, r.content]));
  cachedSystemContext = ORDER
    .filter((n) => map[n])
    .map((n) => `### ${n}\n\n${map[n]}`)
    .join("\n\n---\n\n");

  return cachedSystemContext;
}

// ─── Jina AI embeddings (jina-embeddings-v3, 1024 dims, strong Russian support) ─
async function embed(text: string, task: "retrieval.query" | "retrieval.passage" = "retrieval.query"): Promise<number[]> {
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
    if (!JINA_KEY || !LOVABLE_API_KEY) {
      return Response.json(
        { error: !JINA_KEY ? "JINA_API_KEY не настроен" : "LOVABLE_API_KEY не настроен" },
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

    // 1. Embed the user query
    const queryEmbedding = await embed(message);

    // 2. Semantic search over knowledge base
    const { data: chunks, error: searchError } = await supabase.rpc(
      "match_rag_chunks",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
        min_similarity: 0.3,
      },
    );

    if (searchError) {
      console.error("[chat-rag] Vector search error:", searchError);
    }

    const retrievedContext = (chunks ?? [])
      .map((c: { id: string; content: string; category: string | null }) => {
        const tag = c.category ? `[${c.category}] ` : "";
        return `${tag}${c.content}`;
      })
      .join("\n\n---\n\n");

    // 3. Load foundational system context (cached after first call)
    const sysCtx = await getSystemContext();

    // System prompt — included in every request, cached by OpenRouter for Claude
    const systemText =
      `Ты — специализированный AI-помощник сайта nepriziv.ru. Помогаешь призывникам разобраться в военно-медицинской экспертизе и юридических процедурах призыва в РФ.

ПРАВИЛА:
- Отвечай ТОЛЬКО на основе материалов из базы знаний ниже
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
      ? `Найденные материалы по теме:\n\n${retrievedContext}\n\n---\n\nВопрос: ${message}`
      : `Вопрос: ${message}`;

    // 4. Единый провайдер с основным чатом — Lovable AI Gateway (Gemini).
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: systemText },
          // Conversation history (last 6 turns to keep context manageable)
          ...history.slice(-6),
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[chat-rag] Lovable AI Gateway error:", aiRes.status, errText);

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
