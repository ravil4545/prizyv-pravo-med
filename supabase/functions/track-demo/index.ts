import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Запись анонимной демо-телеметрии. Раньше клиент писал в demo_visitors напрямую,
// а таблица была открыта на чтение/запись всем (RLS USING(true)) — утечка PII
// посетителей (user-agent, устройство, поведение) и порча данных. Теперь:
//   • прямой доступ к таблице закрыт (RLS только для админов),
//   • запись идёт только через эту функцию на service-role с валидацией входа.

/**
 * Прежняя проверка была дырявой сразу с двух сторон:
 *   • `allowedList.length === 0` — при незаданном секрете ALLOWED_ORIGIN
 *     разрешался ЛЮБОЙ origin;
 *   • `origin.includes("lovable.app")` — проверка ПОДСТРОКОЙ, обходится
 *     доменом вида `lovable.app.evil.com`.
 * Теперь — общий белый список со строгим сравнением (_shared/cors.ts).
 */
function getCorsHeaders(req: Request) {
  return corsHeaders(req);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clampInt = (v: unknown) =>
  Math.max(0, Math.min(9999, Math.floor(Number(v) || 0)));
const capStr = (v: unknown, max: number) =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const anonId = String(body?.anonymous_user_id || "");

    // anonymous_user_id обязателен и должен быть валидным UUID (ключ апсерта)
    if (!UUID_RE.test(anonId)) {
      return new Response(JSON.stringify({ error: "invalid anonymous_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = {
      anonymous_user_id: anonId,
      document_uploads_used: clampInt(body?.document_uploads_used),
      ai_questions_used: clampInt(body?.ai_questions_used),
      last_visit_at: new Date().toISOString(),
      user_agent: capStr(body?.user_agent, 500),
      browser: capStr(body?.browser, 50),
      os: capStr(body?.os, 50),
      device_type: capStr(body?.device_type, 20),
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase
      .from("demo_visitors")
      .upsert(row, { onConflict: "anonymous_user_id" });

    if (error) {
      console.error("track-demo upsert error:", error.message);
      return new Response(JSON.stringify({ error: "upsert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "bad request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
