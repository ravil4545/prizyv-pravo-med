import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLlmConfigured, llmChat, MODEL_MAIN } from "../_shared/llmGateway.ts";
import {
  extractArticleNumbers,
  KNOWLEDGE_CATEGORIES,
  renderChunks,
  rerankChunks,
  searchHybrid,
  searchMedicalRequirements,
  traceRagChunks,
} from "../_shared/ragSearch.ts";
import { FALLBACK_ANSWER_POLICY, getRagAnswerPolicy } from "../_shared/ragPolicy.ts";
import { checkAnonRateLimit, getClientIp, getServiceRoleClient, hashIp } from "../_shared/aiUsage.ts";
import { LEGAL_TEMPLATES, STAGE_LABELS, type ReviewResult } from "./contract.ts";

// ════════════════════════════════════════════════════════════════════════
//  case-review — публичный «разбор за 3 минуты» (§2 предложения по оптимизации).
//
//  Единая дверь для холодного трафика. Человек отвечает на 4 коротких вопроса
//  и получает ОДНУ страницу с тремя блоками:
//    ① ситуация по закону — статьи РБ, под которые он потенциально попадает;
//    ② что нужно ПО МЕДИЦИНСКОЙ части — какими исследованиями подтвердить;
//    ③ что нужно ПО ЮРИДИЧЕСКОЙ части — какие заявления подать и в какой срок.
//
//  Разделение мед/юр — не косметика: клиент systematically путает «доказать
//  болезнь» и «оформить это по закону», и без разделения план читается как
//  свалка. Каждый пункт несёт ОСНОВАНИЕ (поле why) — иначе это просто список.
//
//  Осознанно БЕЗ авторизации: гейт стоит на сохранении результата, а не на его
//  получении. Защита — суточный лимит по хешу IP (сырой IP не хранится).
//
//  ВАЖНО про оценку: возвращаем «готовность дела» (полнота документов), а НЕ
//  вероятность решения комиссии. Формулировка выбрана намеренно — процент
//  вероятности не даёт действия и создаёт ложные ожидания, а в этой теме
//  ложное ожидание оборачивается претензией.
// ════════════════════════════════════════════════════════════════════════

// Закрытый белый список. Осознанно НЕ повторяем распространённый в проекте
// паттерн `return origin || "*"` — он возвращает Origin атакующего и сводит
// проверку на нет.
const ALLOWED_ORIGINS = new Set([
  "https://nepriziv.ru",
  "https://www.nepriziv.ru",
]);

const resolveOrigin = (req: Request): string | null => {
  const origin = req.headers.get("origin") || "";
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  const extra = Deno.env.get("ALLOWED_ORIGIN");
  if (extra && origin === extra) return origin;
  return null;
};

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = resolveOrigin(req);
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  };
};

const requestSchema = z.object({
  stage: z.enum(["summons", "medical_board", "decision_made", "preparing"]),
  complaint: z.string().trim().min(3).max(2000),
  hasDocuments: z.enum(["yes", "partial", "no"]),
  // Дата призывных мероприятий — для расчёта срочности юридических шагов.
  conscriptionDate: z.string().trim().max(32).optional().or(z.literal("")),
});

const MAX_PER_DAY = Number(Deno.env.get("CASE_REVIEW_MAX_PER_DAY") || 10);

const DISCLAIMER =
  "Это предварительный разбор по описанию, а не медицинское или юридическое заключение. " +
  "Категорию годности определяет призывная комиссия по результатам освидетельствования.";

/** Сколько дней осталось до призывных мероприятий (null — дата не указана/некорректна). */
function daysUntil(dateIso?: string): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  target.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Заполните все поля разбора", details: parsed.error.issues[0]?.message }),
        { status: 400, headers },
      );
    }
    const { stage, complaint, hasDocuments, conscriptionDate } = parsed.data;

    const admin = getServiceRoleClient();

    // ── Анти-абьюз: суточный лимит по хешу IP (сырой IP не сохраняем) ─────
    const ipHash = await hashIp(getClientIp(req));
    const allowed = await checkAnonRateLimit(admin, "case-review", ipHash, MAX_PER_DAY);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Сегодня доступно ${MAX_PER_DAY} разборов. Попробуйте завтра или запишитесь на консультацию.`,
          rateLimited: true,
        }),
        { status: 429, headers },
      );
    }

    const daysLeft = daysUntil(conscriptionDate || undefined);

    // ── RAG-грунтовка: сначала точечно по статьям, если человек их назвал ──
    const mentionedArticles = extractArticleNumbers(complaint);
    let ragBlock = "";
    let answerPolicy = FALLBACK_ANSWER_POLICY;
    try {
      answerPolicy = await getRagAnswerPolicy(admin);
      const chunks = mentionedArticles.length
        ? await searchMedicalRequirements(admin, complaint, mentionedArticles, { keep: 8 })
        : await rerankChunks(
          complaint,
          await searchHybrid(admin, complaint, { matchCount: 14, categories: KNOWLEDGE_CATEGORIES }),
          { keep: 7 },
        );
      traceRagChunks("case-review", chunks);
      if (chunks.length) ragBlock = renderChunks(chunks, 1100);
    } catch (e) {
      // fail-open: без базы знаний разбор беднее, но не падает
      console.error("[case-review] RAG failed (continuing):", e instanceof Error ? e.message : e);
    }

    if (!isLlmConfigured()) {
      return new Response(
        JSON.stringify({ error: "ИИ временно недоступен. Запишитесь на бесплатный разбор с юристом." }),
        { status: 503, headers },
      );
    }

    const templateCatalog = LEGAL_TEMPLATES
      .map((t) => `- ${t.key} — ${t.title} (${t.category})`)
      .join("\n");

    const systemPrompt =
      `Ты — ассистент по призывному праву сайта nepriziv.ru. По короткому описанию ситуации призывника и выдержкам из ЭКСПЕРТНОЙ БАЗЫ собери предварительный разбор дела.

ИСТОЧНИК И ТОЧНОСТЬ (КРИТИЧЕСКИ ВАЖНО):
- Номера статей Расписания болезней, степени, градусы, пороги бери ДОСЛОВНО из блока «БАЗА ЗНАНИЙ». НЕ указывай числовые границы по памяти и НЕ выдумывай статьи.
- Если в базе нет точного порога — не присваивай степень или категорию, а сформулируй это как нужное обследование.
- НИКОГДА не давай гарантий и НЕ указывай вероятность решения комиссии в процентах.

ГЛАВНОЕ ПРАВИЛО РАЗДЕЛЕНИЯ:
- В "medical" — только то, что ПОДТВЕРЖДАЕТ болезнь: исследования, приёмы специалистов, выписки, сроки наблюдения.
- В "legal" — только то, что ОФОРМЛЯЕТ это по закону: заявления, жалобы, запросы, сроки подачи.
- Каждый пункт ОБЯЗАН иметь поле "why" — одно предложение с основанием: почему без этого пункта дело слабое. Ссылайся на статью РБ или на процедурную норму из базы.

ОЦЕНКА "readiness" — это ПОЛНОТА ДОКУМЕНТОВ (0–10), а НЕ вероятность решения комиссии:
- "confirmed" — что по описанию уже похоже на подтверждённое;
- "missing" — чего не хватает; каждый пункт missing должен соответствовать пункту из medical или legal.

ШАБЛОНЫ ДОКУМЕНТОВ (для пунктов "legal" указывай templateKey ТОЛЬКО из этого списка, иначе null):
${templateCatalog}

ЧТО ВЕРНУТЬ — СТРОГО JSON (без markdown и текста вокруг):
{
  "articles": [{ "number": "68", "title": "краткое название статьи", "why": "почему подходит по описанию" }],
  "readiness": { "score": 0, "confirmed": ["..."], "missing": ["..."] },
  "medical": [{ "title": "Спирометрия с бронхолитиком", "why": "ст. 52 требует подтверждения обратимости обструкции" }],
  "legal": [{ "title": "Приобщить документы к личному делу", "why": "без отметки о приёме документы юридически не существуют", "templateKey": "attach_docs" }],
  "summary": "1–2 предложения: главный вывод и ближайший шаг"
}
Максимум 3 статьи, 6 пунктов medical, 6 пунктов legal. Если зацепок нет — пустые массивы и честный summary.

ЕДИНАЯ ПОЛИТИКА КАЧЕСТВА И КРАТКОСТИ:
${answerPolicy}`;

    const userPrompt = `СИТУАЦИЯ ПРИЗЫВНИКА:
- Этап: ${STAGE_LABELS[stage]}
- Жалоба/диагноз своими словами: ${complaint}
- Медицинские документы на руках: ${
      hasDocuments === "yes" ? "есть" : hasDocuments === "partial" ? "частично" : "нет, только жалобы"
    }
- Призывные мероприятия: ${
      daysLeft === null
        ? "дата не указана"
        : daysLeft >= 0
        ? `через ${daysLeft} дн.`
        : `дата уже прошла (${Math.abs(daysLeft)} дн. назад)`
    }

--- БАЗА ЗНАНИЙ (приоритетный источник статей, чисел и требований) ---

${ragBlock || "(релевантных выдержек не найдено — будь осторожен с числами и статьями, формулируй пункты как уточнения)"}`;

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
      console.error("[case-review] LLM error:", await res.text());
      return new Response(
        JSON.stringify({ error: "Не удалось собрать разбор. Попробуйте ещё раз или запишитесь на консультацию." }),
        { status: 502, headers },
      );
    }

    const payload = await res.json();
    const raw = payload?.choices?.[0]?.message?.content ?? "{}";

    // Ответ модели — произвольный JSON, поэтому типизируем его как «неизвестную
    // запись», а не как Partial<ReviewResult>: иначе мы бы декларировали форму,
    // которую никто не гарантировал, и потеряли бы смысл нормализации ниже.
    let draft: Record<string, unknown>;
    try {
      const parsedDraft: unknown = JSON.parse(raw);
      draft = (typeof parsedDraft === "object" && parsedDraft !== null)
        ? parsedDraft as Record<string, unknown>
        : {};
    } catch {
      console.error("[case-review] LLM вернул не-JSON:", String(raw).slice(0, 400));
      return new Response(
        JSON.stringify({ error: "Не удалось разобрать ответ ИИ. Попробуйте переформулировать описание." }),
        { status: 502, headers },
      );
    }

    // ── Нормализация: не доверяем форме ответа модели ─────────────────────
    const validKeys = new Set(LEGAL_TEMPLATES.map((t) => t.key));
    const clampText = (v: unknown, cap = 300): string => String(v ?? "").trim().slice(0, cap);
    const asRecords = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v)
        ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        : [];
    const asStrings = (v: unknown, limit: number): string[] =>
      Array.isArray(v) ? v.slice(0, limit).map((s) => clampText(s, 200)).filter(Boolean) : [];

    const readiness = (typeof draft.readiness === "object" && draft.readiness !== null)
      ? draft.readiness as Record<string, unknown>
      : {};

    const result: ReviewResult = {
      articles: asRecords(draft.articles).slice(0, 3).map((a) => ({
        number: clampText(a.number, 8),
        title: clampText(a.title, 160),
        why: clampText(a.why),
      })).filter((a) => a.number || a.title),
      readiness: {
        // Оценка зажата в 0..10 — модель регулярно норовит вернуть проценты.
        score: Math.max(0, Math.min(10, Math.round(Number(readiness.score) || 0))),
        confirmed: asStrings(readiness.confirmed, 6),
        missing: asStrings(readiness.missing, 6),
      },
      medical: asRecords(draft.medical).slice(0, 6).map((i) => ({
        title: clampText(i.title, 200),
        why: clampText(i.why),
      })).filter((i) => i.title),
      legal: asRecords(draft.legal).slice(0, 6).map((i) => {
        const key = clampText(i.templateKey, 40);
        return {
          title: clampText(i.title, 200),
          why: clampText(i.why),
          // Ключ шаблона принимаем только из каталога — иначе фронт получит
          // ссылку в никуда.
          templateKey: validKeys.has(key) ? key : null,
        };
      }).filter((i) => i.title),
      summary: clampText(draft.summary, 600),
      daysUntilConscription: daysLeft,
      disclaimer: DISCLAIMER,
    };

    return new Response(JSON.stringify(result), { headers });
  } catch (err) {
    console.error("[case-review] fatal:", err);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка. Попробуйте позже." }),
      { status: 500, headers },
    );
  }
});
