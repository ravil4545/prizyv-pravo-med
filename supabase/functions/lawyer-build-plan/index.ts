// ════════════════════════════════════════════════════════════════════════
//  lawyer-build-plan (ТЗ §2 — планировщик A3).
//
//  По карточке дела генерирует и СОХРАНЯЕТ два плана:
//    • examination_plan_items — план дообследования (анализы/обследования/спец.),
//    • action_plan_items      — тактический план действий юриста.
//
//  Полный стек P2+P3: Context Bundle → runWithTools с грунт-инструментами
//  (search_rb/get_rb_article/read_document) + write-инструментами планировщика
//  (update_examination_plan/update_action_plan). Якорь дела и автор записи —
//  из проверенного контекста (lawyer_id == залогиненный юрист), не из модели.
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLlmConfigured, type LlmMessage, MODEL_MAIN } from "../_shared/llmGateway.ts";
import { assembleLawyerClientContext, serializeBundle } from "../_shared/contextBundle.ts";
import { AGENT_TOOLS, docSourcesFromBundle, PLANNER_WRITE_TOOLS, runWithTools } from "../_shared/agentTools.ts";
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

const SYSTEM_PROMPT = `Ты — планировщик защиты призывника (юридический ассистент по военно-врачебной экспертизе и Расписанию болезней РФ, ПП №565).

ЗАДАЧА: по контексту дела составить и СОХРАНИТЬ два плана:
1) план дообследования — какие анализы, инструментальные обследования и консультации специалистов нужны, чтобы подтвердить непризывную категорию;
2) тактический план действий юриста — конкретные шаги (подача документов, сроки, обращения), в порядке выполнения.

ПОРЯДОК РАБОТЫ:
- Сначала сверься с Расписанием болезней через search_rb / get_rb_article по диагнозу и документам — не выдумывай статьи.
- При нехватке данных вызови request_missing_info; при противоречиях/пограничных значениях — flag_low_confidence.
- Учитывай ДАТЫ: приоритет у более свежего объективного обследования. Ст.68: II степень — свод 141–155° включительно (годен), III — строго >155°.
- ОБЯЗАТЕЛЬНО сохрани результат: вызови update_examination_plan (полный список пунктов) И update_action_plan (полный список шагов). Каждый — один раз.
- После сохранения дай краткое резюме (3–6 предложений) для юриста: вероятная категория, ключевые статьи РБ, на что сделать упор.

Ты НЕ заменяешь врача и ВВК — формулируешь как помощь юристу.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Требуется авторизация" }, { status: 401, headers: corsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Неверный токен" }, { status: 401, headers: corsHeaders(req) });
    }

    const { lawyerClientId, instruction } = await req.json();
    if (!lawyerClientId) {
      return Response.json({ error: "lawyerClientId обязателен" }, { status: 400, headers: corsHeaders(req) });
    }

    if (!isLlmConfigured()) throw new Error("OPENAI_API_KEY не настроен");

    // Context Bundle (проверка владения карточкой — внутри ассемблера).
    const bundle = await assembleLawyerClientContext(serviceClient, lawyerClientId, user.id);
    // Бюджет контекста урезан, чтобы многораундовый агент стабильно укладывался в лимиты:
    // многораундовый, каждый раунд пересылает растущую историю — компактный
    // контекст не даёт прогону упереться в лимит.
    const contextBlock = serializeBundle(bundle, { maxChars: 3500, docTextChars: 400 });

    const userMsg = (typeof instruction === "string" && instruction.trim())
      ? instruction.slice(0, 1000)
      : "Составь и сохрани план дообследования и тактический план действий по этому делу.";

    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `КОНТЕКСТ ДЕЛА:\n${contextBlock}` },
      { role: "user", content: userMsg },
    ];

    const result = await runWithTools(
      serviceClient,
      {
        scope: "lawyer",
        docSources: docSourcesFromBundle(bundle.documents),
        lawyerClientId,
        lawyerId: user.id,
        enableWrites: true,
      },
      {
        messages,
        model: MODEL_MAIN,
        temperature: 0.2,
        maxTokens: 1400,
        maxRounds: 4,
        tools: [...AGENT_TOOLS, ...PLANNER_WRITE_TOOLS],
      },
    );

    // Перечитываем сохранённые планы (источник истины — БД, не ответ модели).
    const [{ data: examPlan }, { data: actionPlan }] = await Promise.all([
      serviceClient
        .from("examination_plan_items")
        .select("id, item_type, name, reason, status, due_date, source, created_at")
        .eq("lawyer_client_id", lawyerClientId)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("action_plan_items")
        .select("id, title, description, status, priority, due_date, order_index, source, created_at")
        .eq("lawyer_client_id", lawyerClientId)
        .order("order_index", { ascending: true }),
    ]);

    return Response.json(
      {
        summary: result.content,
        examinationPlan: examPlan || [],
        actionPlan: actionPlan || [],
        toolsUsed: result.toolCalls.map((t) => t.name),
        rounds: result.rounds,
        documentCount: bundle.meta.documentCount,
        accessNote: bundle.meta.accessNote,
      },
      { headers: corsHeaders(req) },
    );
  } catch (err) {
    console.error("lawyer-build-plan error:", err);
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    const status = msg.includes("не найдена") || msg.includes("доступа") ? 403 : 500;
    return Response.json({ error: msg }, { status, headers: corsHeaders(req) });
  }
});
