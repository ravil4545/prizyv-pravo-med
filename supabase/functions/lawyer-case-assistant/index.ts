// ════════════════════════════════════════════════════════════════════════
//  lawyer-case-assistant (ТЗ §2) — грунтованный ассистент по делу для юриста.
//
//  Демонстрирует полный стек оркестрации P2:
//    Context Bundle (assembleLawyerClientContext) → function-calling
//    (runWithTools: search_rb / get_rb_article / read_document / …) → ответ.
//
//  Отвечает на свободный вопрос юриста по КОНКРЕТНОМУ клиенту, опираясь на
//  документы дела и Расписание болезней (через инструменты, а не «по памяти»).
//  Аддитивный endpoint: ничего из существующего не ломает.
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLlmConfigured, type LlmMessage, MODEL_MAIN } from "../_shared/llmGateway.ts";
import { assembleLawyerClientContext, serializeBundle } from "../_shared/contextBundle.ts";
import { docSourcesFromBundle, runWithTools } from "../_shared/agentTools.ts";

const getAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get("origin") || "";
  if (origin === "https://nepriziv.ru" || origin === "https://www.nepriziv.ru") return origin;
  if (origin.endsWith(".lovable.app")) return origin;
  if (origin.startsWith("http://localhost")) return origin;
  return origin || "*";
};

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

const SYSTEM_PROMPT = `Ты — ассистент юриста по военно-врачебной экспертизе и Расписанию болезней РФ (ПП №565). Помогаешь юристу по конкретному делу призывника.

ЖЁСТКИЕ ПРАВИЛА:
1. Опирайся на ФАКТЫ из документов дела и текст Расписания болезней. Не выдумывай статьи и формулировки — сверяйся инструментами search_rb / get_rb_article.
2. ВСЕГДА учитывай ДАТЫ обследований: при противоречии приоритет у более СВЕЖЕГО объективного обследования. В ответе указывай даты и какой документ приоритетнее.
3. Ст. 68 (плоскостопие): II степень — продольный свод 141–155° включительно (ГОДЕН, Б-3); III степень — строго >155° (категория «В»). Угол ровно 155° — это ещё II степень. Не округляй вверх.
4. Если данных не хватает или они противоречивы — вызови request_missing_info / flag_low_confidence, а не давай уверенный вывод.
5. Ты НЕ заменяешь врача и ВВК. Формулируй как помощь юристу: вероятная категория, обоснование статьёй, что доукомплектовать.
6. Отвечай кратко и по делу, со ссылками на номера статей РБ и конкретные документы.`;

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

    const { lawyerClientId, question } = await req.json();
    if (!lawyerClientId || !question || typeof question !== "string") {
      return Response.json({ error: "lawyerClientId и question обязательны" }, { status: 400, headers: corsHeaders(req) });
    }

    if (!isLlmConfigured()) throw new Error("GROQ_API_KEY не настроен");

    // Context Bundle (проверка владения карточкой — внутри ассемблера).
    const bundle = await assembleLawyerClientContext(serviceClient, lawyerClientId, user.id);
    // Бюджет контекста урезан под free-tier TPM Groq (12000 ток/мин) — см.
    // комментарий в lawyer-build-plan.
    const contextBlock = serializeBundle(bundle, { maxChars: 3500, docTextChars: 400 });

    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `КОНТЕКСТ ДЕЛА:\n${contextBlock}` },
      { role: "user", content: question.slice(0, 2000) },
    ];

    const result = await runWithTools(
      serviceClient,
      { scope: "lawyer", docSources: docSourcesFromBundle(bundle.documents) },
      { messages, model: MODEL_MAIN, temperature: 0.2, maxTokens: 1100, maxRounds: 3 },
    );

    return Response.json(
      {
        answer: result.content,
        rounds: result.rounds,
        toolsUsed: result.toolCalls.map((t) => t.name),
        documentCount: bundle.meta.documentCount,
        docSource: bundle.meta.docSource,
        accessNote: bundle.meta.accessNote,
      },
      { headers: corsHeaders(req) },
    );
  } catch (err) {
    console.error("lawyer-case-assistant error:", err);
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    const status = msg.includes("не найдена") || msg.includes("доступа") ? 403 : 500;
    return Response.json({ error: msg }, { status, headers: corsHeaders(req) });
  }
});
