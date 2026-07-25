import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Заголовки собираются НА ЗАПРОС по общему белому списку (_shared/cors.ts).
// Раньше здесь стоял const-объект с "Access-Control-Allow-Origin": "*" — то есть
// эндпоинт отвечал любой странице в интернете. Для admin-users, удаления
// аккаунта и импорта статей это особенно скверно.
const cors = (req: Request) => corsHeaders(req, { methods: "POST, OPTIONS" });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is admin
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("No valid auth header found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    console.log("getUser result:", user?.id, "error:", userError?.message);
    
    if (userError || !user) {
      console.log("User auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    console.log("Roles:", JSON.stringify(roles), "error:", rolesError?.message);

    const isAdmin = roles?.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "list") {
      const { data: { users: authUsers }, error: listError } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });

      if (listError) throw listError;

      const simplified = (authUsers || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      }));

      console.log("Returning", simplified.length, "users");

      return new Response(JSON.stringify({ users: simplified }), {
        headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in admin-users:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
});
