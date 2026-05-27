// lawyer-draft-review: ИИ-ревью черновика ответа юриста перед отправкой в чат.
// Возвращает: tone, completeness, legal_accuracy, suggestion (улучшенная версия),
// warnings (если есть фактические ошибки в статьях РБ или некорректные обещания).
//
// Это страховка от ошибочных формулировок: юрист написал «вам гарантирована
// категория В» — ИИ предупредит «избыток гарантий, переформулируйте».

import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { lawyerClientId, draft, lastClientMessage } = await req.json();
    if (!lawyerClientId || !draft || typeof draft !== "string" || draft.trim().length < 3) {
      return Response.json({ error: "lawyerClientId и draft обязательны" }, { status: 400, headers: corsHeaders(req) });
    }

    // Подгружаем контекст клиента — короткий, чтобы запрос был быстрым.
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

    const prompt = `Ты — старший юрист по военному и медицинскому праву РФ. Проверь черновик ответа
коллеги-юриста КЛИЕНТУ-призывнику перед отправкой.

Контекст клиента:
- Этап дела: ${clientEntry.crm_stage}
- Диагноз: ${clientEntry.diagnosis || "не указан"}
- Ожидаемая категория: ${clientEntry.expected_category || "не указана"}
${lastClientMessage ? `\nПоследний вопрос клиента: "${lastClientMessage.slice(0, 400)}"` : ""}

ЧЕРНОВИК ЮРИСТА:
"${draft.trim().slice(0, 1500)}"

ЗАДАЧА — оцени по 4 критериям (1-5):
- tone — деловой/уважительный, без давления и обещаний-гарантий
- completeness — полнота ответа на вопрос клиента
- legal_accuracy — корректность отсылок к Расписанию болезней / закону / срокам
- clarity — понятность простому призывнику без юр.образования

Если есть РИСКИ — перечисли в warnings (например: «обещает гарантированный результат»,
«ссылается на несуществующую статью», «терминология медицинская без расшифровки», «грубый тон»).

Если ответ хорош — оставь warnings пустым массивом и просто высокий score.

Дай improved — улучшенную версию текста (тот же смысл, но без выявленных проблем),
длина примерно как у оригинала.

Отвечай строго в JSON без markdown-обёртки:
{
  "tone": 5,
  "completeness": 4,
  "legal_accuracy": 5,
  "clarity": 4,
  "warnings": ["..."],
  "improved": "...",
  "verdict": "одно предложение — что в целом"
}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nepriziv.ru",
        "X-Title": "nepriziv.ru Lawyer Draft Review",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages: [
          { role: "system", content: "Ты редактор-юрист. Отвечай строго в JSON. Будь конструктивен — не разноси текст, а помоги его улучшить." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenRouter error:", aiRes.status, errText);
      throw new Error(`AI сервис вернул ошибку: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    let result: Record<string, unknown>;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : JSON.parse(raw);
    } catch {
      result = { warnings: ["Не удалось распарсить ответ ИИ"], improved: "", verdict: raw.slice(0, 200) };
    }

    return Response.json(result, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("lawyer-draft-review error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Неизвестная ошибка" }, {
      status: 500, headers: corsHeaders(req),
    });
  }
});
