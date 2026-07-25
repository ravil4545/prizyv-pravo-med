// lawyer-ready-check: оценка % готовности пакета документов клиента к военкомату.
// Возвращает: score (0..100), missing[], strong[], next_actions[].
//
// Поток: фронт жмёт «Готовность пакета» на вкладке ИИ-анализ карточки клиента →
// функция собирает все meddoc'и (либо из аккаунта клиента, либо из загрузок юриста),
// и просит модель сравнить с типовым «идеальным» пакетом для ожидаемой категории.

import { createClient } from "npm:@supabase/supabase-js@2";
import { llmChat, MODEL_MAIN, isLlmConfigured } from "../_shared/llmGateway.ts";
import { resolveOrigin } from "../_shared/cors.ts";

/**
 * Origin из общего белого списка (_shared/cors.ts).
 * Раньше здесь был локальный список, заканчивавшийся `return origin || "*"`,
 * то есть возвращавший Origin атакующего и обнулявший проверку.
 * "null" = «никому»: браузер не отдаст ответ чужой странице.
 */
const getAllowedOrigin = (req: Request): string => resolveOrigin(req) ?? "null";

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Требуется авторизация" }, { status: 401, headers: corsHeaders(req) });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Неверный токен" }, { status: 401, headers: corsHeaders(req) });
    }

    const { lawyerClientId } = await req.json();
    if (!lawyerClientId) {
      return Response.json({ error: "lawyerClientId обязателен" }, { status: 400, headers: corsHeaders(req) });
    }

    const { data: clientEntry, error: clientError } = await supabase
      .from("lawyer_clients")
      .select("*")
      .eq("id", lawyerClientId)
      .eq("lawyer_id", user.id)
      .single();
    if (clientError || !clientEntry) {
      return Response.json({ error: "Клиент не найден или нет доступа" }, { status: 403, headers: corsHeaders(req) });
    }

    // Тот же двухисточниковый поток, что и lawyer-analyze-client.
    let docs: Array<{ title: string | null; document_date: string | null; ai_explanation: string | null; raw_text: string | null }> = [];
    if (clientEntry.client_user_id) {
      const { data: access } = await supabase
        .from("client_document_access").select("id")
        .eq("client_user_id", clientEntry.client_user_id)
        .eq("lawyer_id", user.id).eq("is_active", true).maybeSingle();
      if (access) {
        const { data } = await supabase.from("medical_documents_v2")
          .select("title, document_date, ai_explanation, raw_text")
          .eq("user_id", clientEntry.client_user_id);
        docs = (data || []) as typeof docs;
      }
    }
    if (docs.length === 0) {
      const { data } = await supabase.from("lawyer_client_med_docs")
        .select("title, document_date, ai_explanation, raw_text")
        .eq("lawyer_client_id", lawyerClientId);
      docs = (data || []) as typeof docs;
    }

    if (!isLlmConfigured()) throw new Error("OPENAI_API_KEY не настроен");

    const docList = docs.length === 0
      ? "(документов нет)"
      : docs.map((d, i) => `${i + 1}. ${d.title || "без названия"} (${d.document_date || "без даты"})${d.ai_explanation ? " — " + d.ai_explanation : ""}`).join("\n");

    const prompt = `Ты — эксперт по военно-врачебной экспертизе РФ (ПП №565).

Дело клиента:
- Диагноз: ${clientEntry.diagnosis || "не указан"}
- Ожидаемая категория годности: ${clientEntry.expected_category || "не указана"}
- Этап CRM: ${clientEntry.crm_stage}

Имеющиеся документы (${docs.length} шт.):
${docList}

ЗАДАЧА: оцени готовность пакета документов к освидетельствованию в военкомате.

Дай:
1) score — целое число 0..100 (насколько пакет готов для уверенного освидетельствования)
2) strong — что уже хорошо собрано (короткими bullet'ами)
3) missing — каких документов не хватает для аргументированного отстаивания категории (с конкретными названиями)
4) next_actions — 3-5 шагов, что юристу делать в ближайшее время

Отвечай строго в JSON:
{
  "score": 72,
  "verdict": "одно предложение — резюме готовности",
  "strong": ["...", "..."],
  "missing": ["...", "..."],
  "next_actions": ["...", "..."]
}`;

    const aiRes = await llmChat({
      model: MODEL_MAIN,
      temperature: 0.2,
      maxTokens: 900,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: "Ты эксперт по ВВЭ. Отвечай строго в JSON без markdown-обёртки." },
        { role: "user", content: prompt },
      ],
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", aiRes.status, errText);
      throw new Error(`AI сервис вернул ошибку: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    let result: { score: number; verdict?: string; strong?: string[]; missing?: string[]; next_actions?: string[] };
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : JSON.parse(raw);
    } catch {
      result = { score: 0, verdict: "Не удалось распарсить ответ ИИ", strong: [], missing: [], next_actions: [raw.slice(0, 300)] };
    }

    // Защита от вне-диапазонного score
    result.score = Math.max(0, Math.min(100, Number(result.score) || 0));

    return Response.json({ ...result, documentsAnalyzed: docs.length }, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("lawyer-ready-check error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Неизвестная ошибка" }, {
      status: 500, headers: corsHeaders(req),
    });
  }
});
