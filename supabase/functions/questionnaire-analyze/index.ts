import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLlmConfigured, llmChat, MODEL_MAIN } from "../_shared/llmGateway.ts";
import {
  KNOWLEDGE_CATEGORIES,
  renderChunks,
  rerankChunks,
  searchHybrid,
  traceRagChunks,
} from "../_shared/ragSearch.ts";
import {
  FALLBACK_ANSWER_POLICY,
  getRagAnswerPolicy,
} from "../_shared/ragPolicy.ts";
import { dedupeAdvice, normalizeAdviceText } from "../_shared/medicalAdvice.ts";
import { resolveOrigin } from "../_shared/cors.ts";

// ════════════════════════════════════════════════════════════════════════
//  questionnaire-analyze (P3.2) — «адаптивный опросник по РБ».
//
//  Вход: ответы пользователя на медицинский опросник (Record<questionId, text>).
//  Делает:
//    1. собирает ТОЛЬКО заполненные/значимые ответы (пустые и «нет» отбрасывает);
//    2. грунтует их выдержками из экспертной базы знаний (searchHybrid, срез
//       KNOWLEDGE_CATEGORIES — без сырой практики с ПДн);
//    3. LLM (с гардом точности числовых порогов) возвращает СТРОГО JSON: по
//       каждой выявленной теме — кандидатные статьи РБ, уточняющие вопросы и
//       нужные обследования.
//
//  Это превращает пассивную форму в активный гид: что проработать и чем
//  подтвердить. Числа/пороги берутся ТОЛЬКО из базы (см. гард) — не выдумываются.
//  verify_jwt включён (это персональные медданные).
// ════════════════════════════════════════════════════════════════════════

/**
 * Origin из общего белого списка (_shared/cors.ts).
 * Раньше здесь был локальный список, заканчивавшийся `return origin || "*"`,
 * то есть возвращавший Origin атакующего и обнулявший проверку.
 * "null" = «никому»: браузер не отдаст ответ чужой странице.
 */
const getAllowedOrigin = (req: Request): string => resolveOrigin(req) ?? "null";

const getCorsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
});

const requestSchema = z.object({
  // Ответы опросника: { "1.1": "текст", ... }. Принимаем и raw_text как запас.
  answers: z.record(z.string()).optional(),
  rawText: z.string().max(40000).optional(),
});

// Ответ считаем «значимым», если он не пустой и не явное отрицание.
const NEGATIVE =
  /^(нет|не|нету|отрицаю|не было|не отмечал|здоров|всё в норме|норма|-|—|n\/?a)\.?$/i;
const isMeaningful = (v: string): boolean => {
  const t = (v || "").trim();
  return t.length >= 2 && !NEGATIVE.test(t);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Аутентификация (персональные медданные) ──────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Требуется аутентификация" }, {
        status: 401,
        headers: corsHeaders,
      });
    }
    const authedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authErr } = await authedClient.auth
      .getUser();
    if (authErr || !authData?.user) {
      return Response.json({ error: "Неверный токен авторизации" }, {
        status: 401,
        headers: corsHeaders,
      });
    }

    if (!isLlmConfigured()) {
      return Response.json({ error: "OPENAI_API_KEY не настроен" }, {
        status: 500,
        headers: corsHeaders,
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Неверный JSON" }, {
        status: 400,
        headers: corsHeaders,
      });
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Некорректный запрос" }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ── 1. Собираем значимые ответы в компактный текст ───────────────────
    let findings = "";
    const { answers, rawText } = parsed.data;
    if (answers && Object.keys(answers).length) {
      findings = Object.entries(answers)
        .filter(([, v]) => isMeaningful(v))
        .map(([id, v]) => `${id}: ${v.trim()}`)
        .join("\n")
        .slice(0, 8000);
    } else if (rawText) {
      findings = rawText.slice(0, 8000);
    }

    if (!findings.trim()) {
      return Response.json(
        {
          topics: [],
          summary:
            "В опроснике нет заполненных значимых ответов — заполните жалобы и анамнез.",
        },
        { headers: corsHeaders },
      );
    }

    // ── 2. RAG-грунтовка по выявленным жалобам (вычищенная база) ──────────
    let ragBlock = "";
    let answerPolicy = FALLBACK_ANSWER_POLICY;
    try {
      const svc = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      answerPolicy = await getRagAnswerPolicy(svc);
      const candidates = await searchHybrid(svc, findings, {
        matchCount: 12,
        categories: KNOWLEDGE_CATEGORIES,
      });
      const chunks = await rerankChunks(findings, candidates, { keep: 6 });
      traceRagChunks("questionnaire-analyze", chunks);
      if (chunks.length) ragBlock = renderChunks(chunks, 1100);
    } catch (e) {
      console.error(
        "[questionnaire-analyze] RAG failed (continuing):",
        e instanceof Error ? e.message : e,
      );
    }

    // ── 3. LLM → строго JSON ─────────────────────────────────────────────
    const systemPrompt =
      `Ты — ассистент военно-врачебной экспертизы сайта nepriziv.ru. По ответам призывника на медицинский опросник и выдержкам из ЭКСПЕРТНОЙ БАЗЫ определи, какие непризывные основания стоит проработать, какие уточнения нужны и какие обследования собрать.

ИСТОЧНИК И ТОЧНОСТЬ (КРИТИЧЕСКИ ВАЖНО):
- Опирайся на блок «БАЗА ЗНАНИЙ». Номера статей РБ, степени, градусы, пороги бери ДОСЛОВНО из него; НЕ указывай числовые границы по памяти и не выдумывай статьи.
- Соблюдай строгие неравенства; значение на границе диапазона относи к тому диапазону, где оно явно указано. Если точного порога в базе нет — не присваивай степень/категорию по числу, а сформулируй это как уточняющий вопрос/нужное обследование.
- Не давай гарантий («точно категория В»), не указывай проценты. Окончательное решение принимает ВВК.

ЧТО ВЕРНУТЬ — СТРОГО JSON следующей структуры (без markdown, без текста вокруг):
{
  "topics": [
    {
      "topic": "краткое название темы (например, «Плоскостопие»)",
      "articles": ["68"],                       // номера статей РБ из базы (строки), [] если неясно
      "followUps": ["уточняющий вопрос 1", "..."], // что спросить, чтобы сузить квалификацию
      "exams": ["рентген стоп с нагрузкой (боковая, стоя)", "..."], // какие обследования/документы собрать
      "rationale": "1–2 предложения почему, со ссылкой на найденное в базе"
    }
  ],
  "summary": "1–2 предложения: общий вывод и приоритет действий"
}
Только темы, по которым в ответах есть зацепка. Если зацепок нет — topics: [].

ЕДИНАЯ ПОЛИТИКА КАЧЕСТВА И КРАТКОСТИ:
${answerPolicy}`;

    const userPrompt =
      `ОТВЕТЫ ОПРОСНИКА (только заполненные, формат «<id вопроса>: <ответ>»):

${findings}

--- БАЗА ЗНАНИЙ (приоритетный источник чисел, статей и обследований) ---

${
        ragBlock ||
        "(релевантных выдержек не найдено — будь осторожен с числами, опирайся на общие непризывные основания и формулируй уточнения)"
      }`;

    const res = await llmChat({
      model: MODEL_MAIN,
      temperature: 0.2,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[questionnaire-analyze] LLM error:",
        res.status,
        errText.slice(0, 300),
      );
      if (res.status === 429) {
        return Response.json({
          error: "Превышен лимит запросов к ИИ. Попробуйте через минуту.",
        }, { status: 429, headers: corsHeaders });
      }
      return Response.json({ error: `Ошибка ИИ-сервиса: ${res.status}` }, {
        status: 503,
        headers: corsHeaders,
      });
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";

    let result: { topics?: unknown; summary?: unknown };
    try {
      const m = content.match(/\{[\s\S]*\}/);
      result = JSON.parse(m ? m[0] : content);
    } catch (e) {
      console.error(
        "[questionnaire-analyze] JSON parse failed:",
        e instanceof Error ? e.message : e,
      );
      return Response.json(
        {
          topics: [],
          summary:
            "Не удалось разобрать анализ. Попробуйте ещё раз или обратитесь к специалисту.",
        },
        { headers: corsHeaders },
      );
    }

    const topics = (Array.isArray(result.topics) ? result.topics : [])
      .filter((topic): topic is Record<string, unknown> =>
        !!topic && typeof topic === "object"
      )
      .slice(0, 5)
      .map((topic) => ({
        ...topic,
        topic: normalizeAdviceText(topic.topic).slice(0, 120),
        articles: [
          ...new Set(
            (Array.isArray(topic.articles) ? topic.articles : [])
              .map((value) => normalizeAdviceText(value))
              .filter(Boolean),
          ),
        ].slice(0, 5),
        followUps: dedupeAdvice(topic.followUps).slice(0, 5),
        exams: dedupeAdvice(topic.exams).slice(0, 6),
        rationale: normalizeAdviceText(topic.rationale).slice(0, 500),
      }));
    const summary = typeof result.summary === "string"
      ? normalizeAdviceText(result.summary).slice(0, 700)
      : "";
    return Response.json({ topics, summary, ragUsed: !!ragBlock }, {
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[questionnaire-analyze] Unexpected:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Неизвестная ошибка" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
});
