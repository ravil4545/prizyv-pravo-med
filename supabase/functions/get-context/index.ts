// ════════════════════════════════════════════════════════════════════════
//  get-context (ТЗ §2.1) — endpoint Context Bundle.
//
//  Отдаёт нормализованный снимок контекста дела для агентов A1–A5. Две роли:
//    • {} или {scope:"client"}          → контекст залогиненного клиента.
//    • {lawyerClientId:"…"}             → контекст карточки CRM (только владелец).
//  Доп.: {serialize:true} вернёт ещё и текстовый блок под промпт (бюджет TPM).
//
//  Авторизация обязательна (verify_jwt=true в config.toml + повторная проверка
//  токена). Service-role используется ТОЛЬКО после проверки владения карточкой
//  (проверку lawyer_id делает сам assembleLawyerClientContext).
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assembleClientContext,
  assembleLawyerClientContext,
  serializeBundle,
  type SerializeOpts,
} from "../_shared/contextBundle.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Неверный токен" }, { status: 401, headers: corsHeaders(req) });
    }

    const body = await req.json().catch(() => ({}));
    const { lawyerClientId, serialize, serializeOpts } = body as {
      lawyerClientId?: string;
      serialize?: boolean;
      serializeOpts?: SerializeOpts;
    };

    const bundle = lawyerClientId
      ? await assembleLawyerClientContext(serviceClient, lawyerClientId, user.id)
      : await assembleClientContext(serviceClient, user.id);

    const payload: Record<string, unknown> = { bundle };
    if (serialize) payload.serialized = serializeBundle(bundle, serializeOpts || {});

    return Response.json(payload, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("get-context error:", err);
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    const status = msg.includes("не найдена") || msg.includes("доступа") ? 403 : 500;
    return Response.json({ error: msg }, { status, headers: corsHeaders(req) });
  }
});
