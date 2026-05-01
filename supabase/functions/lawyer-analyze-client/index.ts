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
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Требуется авторизация" }, { status: 401, headers: corsHeaders(req) });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller
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

    // Verify lawyer owns this client entry
    const { data: clientEntry, error: clientError } = await supabase
      .from("lawyer_clients")
      .select("*")
      .eq("id", lawyerClientId)
      .eq("lawyer_id", user.id)
      .single();

    if (clientError || !clientEntry) {
      return Response.json({ error: "Клиент не найден или нет доступа" }, { status: 403, headers: corsHeaders(req) });
    }

    // Check if document access is granted
    if (!clientEntry.client_user_id) {
      return Response.json({ error: "Клиент не привязан к аккаунту. Попросите клиента зарегистрироваться и дать доступ к документам." }, { status: 400, headers: corsHeaders(req) });
    }

    const { data: access } = await supabase
      .from("client_document_access")
      .select("id")
      .eq("client_user_id", clientEntry.client_user_id)
      .eq("lawyer_id", user.id)
      .eq("is_active", true)
      .single();

    if (!access) {
      return Response.json({ error: "Клиент не дал доступ к документам. Попросите его открыть доступ в личном кабинете." }, { status: 403, headers: corsHeaders(req) });
    }

    // Fetch client's medical documents with AI analysis
    const { data: docs } = await supabase
      .from("medical_documents_v2")
      .select("id, title, document_date, ai_fitness_category, ai_category_chance, ai_recommendations, ai_explanation, raw_text, meta")
      .eq("user_id", clientEntry.client_user_id)
      .order("document_date", { ascending: false });

    if (!docs?.length) {
      return Response.json({ error: "У клиента нет загруженных документов" }, { status: 400, headers: corsHeaders(req) });
    }

    const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY не настроен");

    // Build document summary for prompt
    const docSummary = docs.map((d, i) => {
      const lines = [
        `Документ ${i + 1}: ${d.title || "Без названия"} (${d.document_date || "дата неизвестна"})`,
      ];
      if (d.ai_fitness_category) lines.push(`  Категория по ИИ: ${d.ai_fitness_category}`);
      if (d.ai_explanation) lines.push(`  Пояснение: ${d.ai_explanation}`);
      if (d.raw_text) lines.push(`  Текст документа (первые 600 симв.): ${d.raw_text.slice(0, 600)}`);
      return lines.join("\n");
    }).join("\n\n");

    const prompt = `Ты — эксперт по военно-врачебной экспертизе и Расписанию болезней РФ (ПП №565).

Данные клиента:
- ФИО: ${clientEntry.client_name}
- Год рождения: ${clientEntry.client_birth_year || "не указан"}
- Диагноз (со слов юриста): ${clientEntry.diagnosis || "не указан"}
- Ожидаемая категория (по мнению юриста): ${clientEntry.expected_category || "не указана"}

Загруженные медицинские документы (${docs.length} шт.):
${docSummary}

На основе документов проведи КОМПЛЕКСНЫЙ анализ для юриста-практика:

1. ИТОГОВАЯ КАТЕГОРИЯ — наиболее вероятная категория годности (А/Б/В/Г/Д) с обоснованием по статьям Расписания болезней. Указывай ТОЛЬКО факты, без процентов.

2. СИЛЬНЫЕ СТОРОНЫ ДЕЛА — какие документы и диагнозы работают в пользу категории «В» или «Д».

3. СЛАБЫЕ СТОРОНЫ — чего не хватает, что может помешать получить нужную категорию.

4. ПЛАН ДООБСЛЕДОВАНИЯ — конкретный список:
   - Анализы (с полными названиями)
   - Инструментальные обследования (МРТ, КТ, ЭЭГ и т.п.)
   - Консультации специалистов (с указанием специальности)
   - Для каждого пункта: зачем нужно (1 предложение)

5. ПРОБЕЛЫ В ДОКУМЕНТАХ — каких документов нет, но они нужны для военкомата.

6. РИСКИ — что может пойти не так при освидетельствовании.

7. РЕКОМЕНДАЦИИ ДЛЯ ЮРИСТА — конкретные тактические шаги (подача, сроки, порядок действий).

Отвечай в формате JSON:
{
  "overall_category": "В",
  "category_basis": "...",
  "strong_points": ["...", "..."],
  "weak_points": ["...", "..."],
  "examination_plan": [
    {"type": "analysis|examination|specialist", "name": "...", "reason": "..."}
  ],
  "missing_documents": ["...", "..."],
  "risks": ["...", "..."],
  "lawyer_recommendations": ["...", "..."]
}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nepriziv.ru",
        "X-Title": "nepriziv.ru Lawyer Analysis",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages: [
          { role: "system", content: "Ты эксперт по военно-врачебной экспертизе. Отвечай строго в JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenRouter error:", aiRes.status, errText);
      throw new Error(`AI сервис вернул ошибку: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices[0].message.content;

    let analysis;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawContent);
    } catch {
      analysis = { raw: rawContent };
    }

    return Response.json({ analysis, documentsAnalyzed: docs.length }, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("lawyer-analyze-client error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Неизвестная ошибка" },
      { status: 500, headers: corsHeaders(req) },
    );
  }
});
