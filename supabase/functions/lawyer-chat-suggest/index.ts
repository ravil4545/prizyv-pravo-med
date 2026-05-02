import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify lawyer owns this client entry
    const { data: clientEntry, error: clientError } = await supabase
      .from("lawyer_clients")
      .select("client_name, crm_stage, diagnosis, expected_category")
      .eq("id", lawyerClientId)
      .eq("lawyer_id", user.id)
      .single();

    if (clientError || !clientEntry) {
      return Response.json({ error: "Клиент не найден или нет доступа" }, { status: 403, headers: corsHeaders(req) });
    }

    const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY не настроен");

    // Build conversation transcript (last 20 text messages)
    const CRM_STAGES: Record<string, string> = {
      initial_contact: "Первичный контакт", no_diagnosis: "Нет диагноза",
      has_diagnosis: "Есть диагноз", examinations: "Обследования",
      diagnosis_confirmed: "Диагноз получен", waiting_documents: "Ожидание документов",
      documents_received: "Документы получены", military_office: "Военкомат",
      regional_commission: "Комиссия субъекта", courts: "Суды",
      military_ticket: "Получение ВБ",
    };

    const transcript = messages
      .slice(-20)
      .map((m: { sender_id: string; content: string | null; message_type: string }) => {
        const role = m.sender_id === user.id ? "Юрист" : "Клиент";
        if (m.message_type === "text" && m.content) return `${role}: ${m.content}`;
        if (m.message_type === "image") return `${role}: [отправил фото]`;
        if (m.message_type === "file") return `${role}: [отправил файл]`;
        return null;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = `Ты — опытный юрист по военному праву и призыву в РФ, помогаешь юристу-практику вести переписку с клиентом.

Данные клиента:
- ФИО: ${clientEntry.client_name}
- Этап дела: ${CRM_STAGES[clientEntry.crm_stage] || clientEntry.crm_stage || "не указан"}
- Диагноз: ${clientEntry.diagnosis || "не указан"}

Последние сообщения в чате:
${transcript}

Задача: предложи 3 варианта ответа юриста клиенту.

Требования:
- Вариант 1 («Кратко»): деловой, 1–2 предложения, без воды
- Вариант 2 («Подробно»): развёрнутый с пояснениями по ситуации
- Вариант 3 («Следующие шаги»): конкретные действия, которые клиент должен предпринять

Все варианты должны логично продолжать переписку и учитывать этап дела.

Отвечай строго в JSON:
{
  "summary": "одно предложение о чём переписка",
  "suggestions": [
    {"label": "Кратко", "text": "..."},
    {"label": "Подробно", "text": "..."},
    {"label": "Следующие шаги", "text": "..."}
  ]
}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nepriziv.ru",
        "X-Title": "nepriziv.ru Lawyer Chat Suggest",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages: [
          { role: "system", content: "Ты помощник юриста по военному праву РФ. Отвечай строго в JSON без markdown-обёртки." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenRouter error:", aiRes.status, errText);
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
        summary: "Не удалось проанализировать переписку",
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
