import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * generate-appeal — генерирует черновик жалобы на отрицательное решение призывной комиссии.
 * Принимает eventId (case_events) и appealLevel ('subject' для призывной комиссии субъекта
 * или 'court' для суда). Использует профиль пользователя + AI-анализ документов
 * + детали события как контекст.
 */

const getAllowedOrigin = (req?: Request) => {
  const requestOrigin = req?.headers.get("origin") || "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (allowedOrigin && requestOrigin === allowedOrigin) return requestOrigin;
  if (requestOrigin === "https://nepriziv.ru" || requestOrigin === "https://www.nepriziv.ru") return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app")) return requestOrigin;
  if (requestOrigin.startsWith("http://localhost")) return requestOrigin;
  return allowedOrigin || "*";
};

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

const APPEAL_SUBJECT_PROMPT = `Ты — юрист по призывному праву РФ. Составляешь жалобу в призывную комиссию субъекта РФ
на решение нижестоящей призывной комиссии. Опираешься на ФЗ-53, Положение о военно-врачебной экспертизе
(ПП РФ № 565), КАС РФ.

Формат документа — строгий, официально-деловой стиль. Структура:
1. Шапка («В призывную комиссию субъекта РФ — указать регион», от кого, адрес, контакты)
2. Заголовок «ЖАЛОБА на решение призывной комиссии»
3. Изложение фактов (когда было решение, какое, кем принято)
4. Основания несогласия (со ссылками на конкретные документы и статьи РБ-565)
5. Правовое обоснование (ссылки на статьи законов)
6. Просительная часть («Прошу: 1) отменить решение... 2) направить на дополнительное обследование... 3) определить категорию...»)
7. Приложения (перечень документов)
8. Подпись, дата

ВАЖНО:
- Используй ТОЛЬКО факты из предоставленного контекста (профиль + документы + событие)
- Где данных не хватает — оставляй плейсхолдер в [квадратных скобках]
- НЕ выдумывай диагнозы или даты
- Указывай статьи РБ-565 в формате [Ст. NN]
- Срок подачи жалобы — 3 месяца со дня принятия обжалуемого решения`;

const APPEAL_COURT_PROMPT = `Ты — юрист по призывному праву РФ. Составляешь административное исковое заявление в суд
(глава 22 КАС РФ) об оспаривании решения призывной комиссии.

Формат — административное исковое заявление по КАС РФ. Структура:
1. Шапка («В [___] районный суд», административный истец, административный ответчик — военный комиссариат и/или призывная комиссия)
2. Цена иска: не подлежит оценке
3. Госпошлина: 300 рублей (физлицо)
4. Заголовок «АДМИНИСТРАТИВНОЕ ИСКОВОЕ ЗАЯВЛЕНИЕ об оспаривании решения призывной комиссии»
5. Изложение обстоятельств (даты, решение, прохождение медкомиссии)
6. Доводы о незаконности (со ссылками на доказательства и нормы права)
7. Правовое обоснование (ст. 218 КАС РФ, ФЗ-53, ПП РФ № 565)
8. Просительная часть («Признать незаконным решение...», «Обязать...»)
9. Приложения
10. Дата, подпись

ВАЖНО:
- Срок обжалования в суд — 3 месяца (ст. 219 КАС РФ)
- Решение призывной комиссии субъекта РФ приостанавливается при обжаловании в суд
- Указывай статьи РБ-565 в формате [Ст. NN]
- Где данных не хватает — плейсхолдеры в [квадратных скобках]`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body = await req.json();
    const eventId: string = body.eventId;
    const appealLevel: "subject" | "court" = body.appealLevel || "subject";
    const userContext: string = body.userContext || "";

    if (!eventId) {
      return new Response(JSON.stringify({ error: "eventId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Загружаем событие
    const { data: event, error: evErr } = await supabase
      .from("case_events")
      .select("*")
      .eq("id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (evErr || !event) {
      return new Response(JSON.stringify({ error: "event_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Профиль
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, birth_date, region, military_office_name")
      .eq("id", userId)
      .maybeSingle();

    // Документы + AI-анализ
    const { data: docs } = await supabase
      .from("medical_documents_v2")
      .select(
        "title, document_date, ai_fitness_category, ai_category_chance, ai_explanation, document_types(name)",
      )
      .eq("user_id", userId)
      .order("document_date", { ascending: false })
      .limit(20);

    // Ссылки на статьи
    const { data: links } = await supabase
      .from("document_article_links")
      .select(
        "ai_category_chance, ai_explanation, disease_articles_565(article_number, title)",
      );

    // Формируем контекст
    let context = "=== ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ===\n";
    if (profile) {
      context += `ФИО: ${profile.full_name || "[ФИО не указано]"}\n`;
      if (profile.birth_date) context += `Дата рождения: ${profile.birth_date}\n`;
      if (profile.region) context += `Регион: ${profile.region}\n`;
      if (profile.military_office_name)
        context += `Военкомат: ${profile.military_office_name}\n`;
    }

    context += "\n=== ОБЖАЛУЕМОЕ СОБЫТИЕ ===\n";
    context += `Дата: ${event.event_date}\n`;
    context += `Тип: ${event.event_type}\n`;
    context += `Название: ${event.title}\n`;
    if (event.description) context += `Детали: ${event.description}\n`;
    context += `Исход: отрицательный\n`;

    if (docs && docs.length > 0) {
      context += "\n=== МЕДИЦИНСКИЕ ДОКУМЕНТЫ ===\n";
      for (const d of docs.slice(0, 12)) {
        context += `- ${d.title || "Документ"} от ${d.document_date || "—"}`;
        if (d.ai_fitness_category) context += ` (AI: кат. ${d.ai_fitness_category})`;
        context += "\n";
      }
    }

    if (links && links.length > 0) {
      const top = [...links]
        .sort((a, b) => (b.ai_category_chance || 0) - (a.ai_category_chance || 0))
        .slice(0, 3);
      context += "\n=== ОСНОВНЫЕ СТАТЬИ РБ-565 ===\n";
      for (const l of top) {
        const a = (l as { disease_articles_565?: { article_number: string; title: string } | null })
          .disease_articles_565;
        if (!a) continue;
        context += `- Ст. ${a.article_number} (${a.title}) — шанс кат. В: ${l.ai_category_chance || 0}%\n`;
        if (l.ai_explanation) context += `  ${l.ai_explanation}\n`;
      }
    }

    if (userContext) {
      context += "\n=== ДОПОЛНИТЕЛЬНО ОТ ПОЛЬЗОВАТЕЛЯ ===\n";
      context += userContext;
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      appealLevel === "court" ? APPEAL_COURT_PROMPT : APPEAL_SUBJECT_PROMPT;

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nepriziv.ru",
        "X-Title": "nepriziv.ru Appeal Generator",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Составь жалобу на основе следующего контекста.\n\n${context}\n\nВерни ТОЛЬКО текст документа, готовый к копированию в Word. Без вводных фраз.`,
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "ai_error", details: txt }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const text = aiData.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({
        text,
        appealLevel,
        eventId,
        warning:
          appealLevel === "court"
            ? "С 2023 года решение призывной комиссии при обжаловании в СУД автоматически НЕ приостанавливается. Сначала рекомендуем обжаловать в призывную комиссию субъекта."
            : "Срок подачи жалобы — 3 месяца со дня решения. После подачи решение НЕ исполняется до рассмотрения.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("generate-appeal error", err);
    return new Response(
      JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
