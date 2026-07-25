import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODEL_VISION_FAST } from "../_shared/llmGateway.ts";
import { resolveOrigin } from "../_shared/cors.ts";
import { enforceDailyLimit } from "../_shared/aiGuard.ts";
import { getServiceRoleClient } from "../_shared/aiUsage.ts";

/**
 * parse-summons — распознаёт повестку из военкомата по фото/PDF.
 * Извлекает:
 *  - дату явки
 *  - время явки
 *  - адрес военкомата
 *  - повод (медкомиссия / уточнение данных / отправка к месту службы)
 *  - ФИО получателя
 *
 * При успехе автоматически создаёт запись в `case_events`.
 */

/**
 * Origin из общего белого списка (_shared/cors.ts).
 * Раньше здесь был локальный список, заканчивавшийся `return origin || "*"`,
 * то есть возвращавший Origin атакующего и обнулявший проверку.
 * "null" = «никому»: браузер не отдаст ответ чужой странице.
 */
const getAllowedOrigin = (req?: Request): string => (req ? resolveOrigin(req) ?? "null" : "null");

const getCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": getAllowedOrigin(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
});

const SYSTEM_PROMPT = `Ты — ассистент, распознающий повестки из военкоматов РФ.
Получаешь фото повестки. Извлекай поля и возвращай СТРОГО JSON:

{
  "event_date": "YYYY-MM-DD",          // дата явки
  "event_time": "HH:MM",               // время явки (если есть, иначе null)
  "office_name": "...",                // полное название военкомата
  "office_address": "...",             // адрес явки
  "recipient_name": "...",             // ФИО получателя повестки
  "reason": "medical|clarification|conscription|other",  // повод вызова
  "reason_text": "...",                // дословный повод из повестки
  "confidence": 0-100,                 // насколько уверенно распознано
  "warnings": ["..."]                  // если что-то нечитаемо
}

reason:
- medical = «для прохождения медицинского освидетельствования»
- clarification = «для уточнения сведений воинского учёта»
- conscription = «для отправки к месту прохождения службы»
- other = всё остальное

Если документ НЕ повестка — верни {"error":"not_a_summons"}.
Возвращай ТОЛЬКО валидный JSON, без пояснений и markdown.`;

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
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    // Суточный лимит: распознавание повестки — vision-запрос к OpenAI.
    // Лимит по пользователю, а не по IP (см. _shared/aiGuard.ts).
    const limited = await enforceDailyLimit({
      req,
      admin: getServiceRoleClient(),
      functionName: "parse-summons",
      userId,
      envKey: "PARSE_SUMMONS_MAX_PER_DAY",
      fallbackMax: 20,
      headers: corsHeaders,
      message: "Сегодня доступно 20 распознаваний повестки. Попробуйте завтра или добавьте событие вручную.",
    });
    if (limited) return limited;

    const { imageBase64, autoCreateEvent = true } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Используем прямой OpenAI API, как и в analyze-medical-document.
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_VISION_FAST,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Распознай повестку и верни JSON по схеме." },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error:", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "ai_error", details: txt }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content || "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse error", e, raw);
      return new Response(JSON.stringify({ error: "parse_error", raw }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.error === "not_a_summons") {
      return new Response(JSON.stringify({ error: "not_a_summons" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let createdEventId: string | null = null;
    if (autoCreateEvent && parsed.event_date) {
      const REASON_MAP: Record<string, { type: string; title: string }> = {
        medical: { type: "medical", title: "Медицинское освидетельствование (повестка)" },
        clarification: { type: "other", title: "Явка для уточнения сведений (повестка)" },
        conscription: { type: "commission", title: "Отправка к месту службы (повестка)" },
        other: { type: "other", title: "Явка по повестке" },
      };
      const reasonKey = String(parsed.reason || "other");
      const mapped = REASON_MAP[reasonKey] || REASON_MAP.other;
      const desc = [
        parsed.event_time ? `Время: ${parsed.event_time}` : null,
        parsed.office_name ? `Военкомат: ${parsed.office_name}` : null,
        parsed.office_address ? `Адрес: ${parsed.office_address}` : null,
        parsed.reason_text ? `Основание: ${parsed.reason_text}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: ev, error: insErr } = await supabase
        .from("case_events")
        .insert({
          user_id: userId,
          event_date: parsed.event_date,
          event_type: mapped.type,
          title: mapped.title,
          description: desc,
          outcome: "pending",
        })
        .select("id")
        .single();

      if (!insErr && ev) createdEventId = ev.id;
      else console.error("case_events insert error", insErr);
    }

    return new Response(
      JSON.stringify({ ...parsed, createdEventId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("parse-summons error", err);
    return new Response(
      JSON.stringify({ error: "internal", message: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
