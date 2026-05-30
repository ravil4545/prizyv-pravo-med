import { createClient } from "npm:@supabase/supabase-js@2";
import { llmChat, MODEL_MAIN, isLlmConfigured } from "../_shared/llmGateway.ts";

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

type MessageInput = { sender_id: string; content: string | null; message_type: string };

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

    const { lawyerClientId, messages } = await req.json();
    if (!lawyerClientId || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "lawyerClientId и messages обязательны" }, { status: 400, headers: corsHeaders(req) });
    }

    const { data: clientEntry, error: clientError } = await supabase
      .from("lawyer_clients")
      .select("client_name, crm_stage, diagnosis, expected_category")
      .eq("id", lawyerClientId)
      .eq("lawyer_id", user.id)
      .single();

    if (clientError || !clientEntry) {
      return Response.json({ error: "Клиент не найден или нет доступа" }, { status: 403, headers: corsHeaders(req) });
    }

    if (!isLlmConfigured()) throw new Error("GROQ_API_KEY не настроен");

    const CRM_STAGES: Record<string, string> = {
      initial_contact: "Первичный контакт", no_diagnosis: "Нет диагноза",
      has_diagnosis: "Есть диагноз", examinations: "Обследования",
      diagnosis_confirmed: "Диагноз получен", waiting_documents: "Ожидание документов",
      documents_received: "Документы получены", military_office: "Военкомат",
      regional_commission: "Комиссия субъекта", courts: "Суды",
      military_ticket: "Получение ВБ",
    };

    const allMsgs: MessageInput[] = (messages as MessageInput[]).slice(-40);

    // ── Find the last client text message — this is what we answer ─────────
    let lastClientMsgContent: string | null = null;
    let lastClientMsgIdx = -1;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      const m = allMsgs[i];
      if (m.message_type === "text" && m.sender_id !== user.id && m.content?.trim()) {
        lastClientMsgContent = m.content.trim();
        lastClientMsgIdx = i;
        break;
      }
    }

    if (!lastClientMsgContent) {
      return Response.json({ summary: "", suggestions: [] }, { headers: corsHeaders(req) });
    }

    // ── History: messages BEFORE the last client question (max 12) ─────────
    const historyMsgs = allMsgs.slice(0, lastClientMsgIdx).slice(-12);
    const historyLines = historyMsgs
      .map((m) => {
        const role = m.sender_id === user.id ? "Юрист" : "Клиент";
        if (m.message_type === "text" && m.content) return `${role}: ${m.content}`;
        if (m.message_type === "image") return `${role}: [фото]`;
        if (m.message_type === "file") return `${role}: [файл]`;
        return null;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = `Ты — опытный юрист по военному праву и призыву в РФ, помогаешь юристу-практику отвечать клиентам.

Данные клиента:
- ФИО: ${clientEntry.client_name}
- Этап дела: ${CRM_STAGES[clientEntry.crm_stage] || clientEntry.crm_stage || "не указан"}
- Диагноз: ${clientEntry.diagnosis || "не указан"}

ПОСЛЕДНИЙ ВОПРОС КЛИЕНТА (именно на него нужен ответ):
"${lastClientMsgContent}"
${historyLines ? `\nПредыстория переписки (используй ТОЛЬКО если она напрямую влияет на ответ к текущему вопросу):\n${historyLines}` : ""}

ЗАДАЧА: дай 3 варианта ответа ТОЛЬКО на текущий вопрос клиента. Не суммируй предыдущую переписку — отвечай на то, что спросил клиент прямо сейчас.

Требования к вариантам:
- «Кратко»: 1–2 предложения, деловой тон, без воды
- «Подробно»: развёрнуто, с пояснением почему именно так
- «Следующие шаги»: чёткий список действий для клиента

Отвечай строго в JSON:
{
  "summary": "одно предложение — что именно спрашивает клиент",
  "suggestions": [
    {"label": "Кратко", "text": "..."},
    {"label": "Подробно", "text": "..."},
    {"label": "Следующие шаги", "text": "..."}
  ]
}`;

    const aiRes = await llmChat({
      model: MODEL_MAIN,
      temperature: 0.35,
      maxTokens: 1200,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: "Ты помощник юриста по военному праву РФ. Отвечай строго в JSON без markdown-обёртки." },
        { role: "user", content: prompt },
      ],
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[lawyer-chat-suggest] Groq error:", aiRes.status, errText);
      throw new Error(`AI сервис вернул ошибку: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let result: { summary: string; suggestions: { label: string; text: string }[] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawContent);
    } catch {
      result = {
        summary: "Не удалось проанализировать вопрос",
        suggestions: [{ label: "Ответ", text: rawContent.slice(0, 300) }],
      };
    }

    return Response.json(result, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("lawyer-chat-suggest error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Неизвестная ошибка" },
      { status: 500, headers: corsHeaders(req) },
    );
  }
});
