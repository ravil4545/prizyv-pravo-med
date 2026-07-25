import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "npm:resend@4.0.0";
import { corsHeaders } from "../_shared/cors.ts";

// Письмо юристу о том, что клиент передал дело из ИИ-чата (эскалация).
// Вызывается клиентом (verify_jwt=true) сразу после RPC client_escalate_to_lawyer.
// Без письма юрист узнаёт об эскалации, только зайдя в кабинет.

// Заголовки собираются НА ЗАПРОС по общему белому списку (_shared/cors.ts).
// Раньше здесь стоял const-объект с "Access-Control-Allow-Origin": "*", то есть
// эндпоинт отвечал любой странице в интернете.
const cors = (req: Request) => corsHeaders(req, { methods: "POST, OPTIONS" });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Письмо может инициировать только сам клиент по СВОЕЙ карточке.
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Не авторизован" }, 401);

    const { lawyer_client_id } = await req.json().catch(() => ({}));
    if (!lawyer_client_id || typeof lawyer_client_id !== "string") {
      return json({ error: "lawyer_client_id обязателен" }, 400);
    }

    const { data: card } = await supabase
      .from("lawyer_clients")
      .select("id, lawyer_id, client_user_id, client_name, client_phone, escalation_requested")
      .eq("id", lawyer_client_id)
      .single();
    if (!card || card.client_user_id !== user.id) return json({ error: "Карточка не найдена" }, 404);
    if (!card.escalation_requested) return json({ error: "Эскалация не активна" }, 400);

    // Дедуп: не чаще одного письма по карточке в 15 минут (защита от повторных кликов).
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recent } = await supabase
      .from("contact_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "escalation_notice")
      .gte("created_at", since)
      .ilike("message", `%${lawyer_client_id}%`);
    if ((recent ?? 0) > 0) return json({ success: true, deduped: true });

    // Сводка, которую RPC записал в заметки дела (note_type='escalation').
    const { data: note } = await supabase
      .from("case_notes")
      .select("content")
      .eq("lawyer_client_id", lawyer_client_id)
      .eq("note_type", "escalation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lawyerUser } = await supabase.auth.admin.getUserById(card.lawyer_id);
    const lawyerEmail = lawyerUser?.user?.email;

    const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const cardUrl = `https://nepriziv.ru/lawyer/clients/${card.id}`;

    // Журнал-бэкап — он же дедуп-леджер выше.
    await supabase.from("contact_submissions").insert({
      name: `Эскалация: ${card.client_name}`,
      phone: card.client_phone || "-",
      email: lawyerEmail || "-",
      message:
        `Клиент передал дело юристу из ИИ-чата.\nКарточка: ${lawyer_client_id}\n${cardUrl}\nДата: ${now}`,
      status: "escalation_notice",
    });

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey || !lawyerEmail) {
      console.warn("escalation email skipped:", { hasKey: !!resendApiKey, hasEmail: !!lawyerEmail });
      return json({ success: true, emailed: false });
    }

    const summary = (note?.content || "").slice(0, 1500);
    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: "Непризыв <noreply@nepriziv.ru>",
      to: [lawyerEmail],
      subject: `🔴 Клиент просит юриста: ${card.client_name}`,
      html: `
        <h2 style="margin:0 0 12px;">Клиент передал дело юристу</h2>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px;font-weight:bold;">Клиент:</td><td style="padding:4px 12px;">${esc(card.client_name || "—")}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Телефон:</td><td style="padding:4px 12px;">${esc(card.client_phone || "не указан")}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Когда:</td><td style="padding:4px 12px;">${now} (МСК)</td></tr>
        </table>
        ${summary
          ? `<p style="margin:14px 0 4px;font-weight:bold;">Сводка из ИИ-чата:</p>
             <div style="padding:10px 14px;background:#f6f6f4;border-left:3px solid #b91c1c;white-space:pre-wrap;">${esc(summary)}</div>`
          : ""}
        <p style="margin:18px 0;">
          <a href="${cardUrl}" style="background:#b91c1c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">
            Открыть карточку клиента
          </a>
        </p>
        <p style="color:#666;font-size:13px;">В карточке нажмите «Взять в работу», чтобы снять флаг эскалации, и свяжитесь с клиентом в чате.</p>
      `,
    });
    if (emailError) {
      console.error("Resend error:", JSON.stringify(emailError));
      return json({ success: true, emailed: false });
    }
    return json({ success: true, emailed: true });
  } catch (error) {
    console.error("notify-lawyer-escalation error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
