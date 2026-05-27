// Edge-функция: удаление собственного аккаунта пользователем.
// Защита: вызывающий должен быть аутентифицирован, удалить можно ТОЛЬКО себя.
//
// Поток:
//   1. Снимаем юзера из Authorization-токена.
//   2. Удаляем строки из lawyer_profiles / lawyer_clients (как юрист)
//      и из lawyer_clients (как клиент), затем из profiles.
//      (Это страховка — если на проде FK уже c ON DELETE CASCADE, дубль безвреден.)
//   3. Удаляем самого пользователя через admin.deleteUser (service-role).
//
// Edge функция деплоится через `supabase functions deploy delete-user-account`.
//
// Для работы нужны секреты:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const confirmation: string = (body.confirmation || "").trim();
    // Доп. защита: фронт должен прислать строку "УДАЛИТЬ" в подтверждение.
    if (confirmation !== "УДАЛИТЬ") {
      return new Response(
        JSON.stringify({ error: "Bad confirmation. Send {confirmation:'УДАЛИТЬ'}" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const uid = user.id;

    // Подчищаем «контентные» таблицы — на случай если каскадные FK не настроены.
    // Не валим запрос на отдельных ошибках — главное удалить auth-юзера.
    const cleanup: Array<{ table: string; eqCol: string; eqVal: string }> = [
      { table: "lawyer_client_med_docs", eqCol: "lawyer_id",   eqVal: uid },
      { table: "lawyer_clients",         eqCol: "lawyer_id",   eqVal: uid },
      { table: "lawyer_clients",         eqCol: "client_user_id", eqVal: uid },
      { table: "lawyer_profiles",        eqCol: "user_id",     eqVal: uid },
      { table: "medical_documents_v2",   eqCol: "user_id",     eqVal: uid },
      { table: "case_notes",             eqCol: "author_id",   eqVal: uid },
      { table: "client_document_access", eqCol: "client_user_id", eqVal: uid },
      { table: "client_document_access", eqCol: "lawyer_id",   eqVal: uid },
      { table: "user_subscriptions",     eqCol: "user_id",     eqVal: uid },
      { table: "user_roles",             eqCol: "user_id",     eqVal: uid },
      { table: "profiles",               eqCol: "id",          eqVal: uid },
    ];
    for (const c of cleanup) {
      const { error } = await admin.from(c.table).delete().eq(c.eqCol, c.eqVal);
      if (error) {
        // Логируем, но продолжаем — таблица может не существовать на этом окружении
        console.warn(`cleanup ${c.table} failed`, error.message);
      }
    }

    const { error: delError } = await admin.auth.admin.deleteUser(uid);
    if (delError) {
      return new Response(JSON.stringify({ error: delError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
