import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "npm:resend@4.0.0";

/**
 * send-deadline-reminders (Модуль 4, Фаза 3 — движок уведомлений).
 *
 * Вызывается ПО РАСПИСАНИЮ (ежедневный cron). Находит события `case_events`,
 * до которых осталось 3 / 1 / 0 дней (сегодня по МСК), и рассылает напоминания:
 *   1) e-mail клиенту           (если notify_client_email);
 *   2) e-mail закреплённому юристу (если notify_lawyer_email и клиент привязан).
 * Push клиенту — Фаза 3b (нужны service worker + VAPID), здесь отмечен TODO.
 *
 * Идемпотентность: в `case_events.reminders_sent` хранятся отправленные окна
 * (d3/d1/d0); повторный запуск в тот же день не задублирует письма.
 *
 * Защита: verify_jwt=false (cron без JWT). Заголовок x-cron-secret сверяется с
 * секретом `cron_secret` из Supabase Vault через RPC public.match_cron_secret
 * (доступна только service_role). Единый источник истины — Vault; ручной
 * CRON_SECRET в окружении больше не нужен. Тело (необязательно):
 * { "dry_run": true } — посчитать, ничего не отправляя.
 *
 * Секреты Supabase (Edge Functions): RESEND_API_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY (уже есть). Секрет cron — в Vault (cron_secret).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SITE = "https://nepriziv.ru";
const FROM = "НеПризыв <onboarding@resend.dev>"; // как в остальных функциях проекта
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // МСК = UTC+3 (без перехода на лето)
const REMIND_OFFSETS = [3, 1, 0]; // за сколько дней слать напоминания

const TYPE_LABELS: Record<string, string> = {
  commission: "Призывная комиссия",
  appeal: "Обжалование",
  court: "Суд",
  medical: "Медицинское освидетельствование",
  document: "Подача документов",
  other: "Событие по делу",
};

interface CaseEventRow {
  id: string;
  user_id: string;
  event_date: string; // YYYY-MM-DD
  event_type: string;
  title: string;
  description: string | null;
  reminders_sent: string[] | null;
  notify_client_email: boolean;
  notify_lawyer_email: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const dateUtcMs = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtRu = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
};
const whenPhrase = (days: number) =>
  days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} дн.`;

const clientEmailHtml = (
  title: string,
  typeLabel: string,
  dateStr: string,
  days: number,
  description: string | null,
) => `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <h2 style="margin:0 0 8px">Напоминание о деле</h2>
    <p style="font-size:16px;margin:0 0 16px"><strong>${escapeHtml(title)}</strong> — <strong>${whenPhrase(days)}</strong> (${dateStr}).</p>
    <table style="font-size:14px;border-collapse:collapse">
      <tr><td style="padding:2px 12px 2px 0;color:#666">Тип</td><td>${escapeHtml(typeLabel)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">Дата</td><td>${dateStr}</td></tr>
    </table>
    ${description ? `<p style="font-size:14px;margin:12px 0;white-space:pre-line">${escapeHtml(description)}</p>` : ""}
    <p style="font-size:14px;color:#444;margin:16px 0">Проверьте, что документы готовы. Если событие связано с явкой или подачей — возьмите паспорт и относящиеся к делу справки.</p>
    <p style="margin:20px 0"><a href="${SITE}/dashboard/calendar" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Открыть календарь</a></p>
    <p style="font-size:12px;color:#999;margin-top:24px">Непризыв · цифровой адвокат призывника</p>
  </div>`;

const lawyerEmailHtml = (
  clientName: string,
  title: string,
  typeLabel: string,
  dateStr: string,
  days: number,
) => `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <h2 style="margin:0 0 8px">Дедлайн клиента приближается</h2>
    <p style="font-size:16px;margin:0 0 16px">У клиента <strong>${escapeHtml(clientName)}</strong> — <strong>${escapeHtml(title)}</strong> ${whenPhrase(days)} (${dateStr}).</p>
    <table style="font-size:14px;border-collapse:collapse">
      <tr><td style="padding:2px 12px 2px 0;color:#666">Тип</td><td>${escapeHtml(typeLabel)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">Дата</td><td>${dateStr}</td></tr>
    </table>
    <p style="font-size:14px;color:#444;margin:16px 0">Свяжитесь с клиентом и проверьте готовность досье до наступления срока.</p>
    <p style="margin:20px 0"><a href="${SITE}/lawyer/clients" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Открыть CRM</a></p>
    <p style="font-size:12px;color:#999;margin-top:24px">Непризыв · уведомление для юриста</p>
  </div>`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // --- защита: сверяем заголовок с секретом cron_secret из Vault (RPC) ---
  const token = req.headers.get("x-cron-secret") ?? "";
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: secretOk, error: secretErr } = await supabase.rpc("match_cron_secret", {
    p_token: token,
  });
  if (secretErr) {
    console.error("Secret check failed:", secretErr);
    return json({ error: "Secret validation error" }, 500);
  }
  if (secretOk !== true) return json({ error: "Unauthorized" }, 401);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const resend = new Resend(RESEND_API_KEY);

  let dryRun = false;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    }
  } catch {
    // тело необязательно
  }

  // --- окно дат: сегодня (МСК) .. +3 дня ---
  const nowMsk = new Date(Date.now() + MSK_OFFSET_MS);
  const todayMs = Date.UTC(nowMsk.getUTCFullYear(), nowMsk.getUTCMonth(), nowMsk.getUTCDate());
  const toYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const todayStr = toYmd(todayMs);
  const maxStr = toYmd(todayMs + 3 * 86400000);

  const { data: events, error } = await supabase
    .from("case_events")
    .select(
      "id,user_id,event_date,event_type,title,description,reminders_sent,notify_client_email,notify_lawyer_email",
    )
    .eq("remind_enabled", true)
    .gte("event_date", todayStr)
    .lte("event_date", maxStr);

  if (error) {
    console.error("Query error:", error);
    return json({ error: "Query failed", detail: error.message }, 500);
  }

  const rows = (events ?? []) as CaseEventRow[];
  let clientSent = 0;
  let lawyerSent = 0;
  let processed = 0;
  const errors: string[] = [];

  const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
    try {
      const { error: sendErr } = await resend.emails.send({ from: FROM, to: [to], subject, html });
      if (sendErr) {
        console.error("Resend error:", sendErr);
        return false;
      }
      return true;
    } catch (e) {
      console.error("Resend exception:", String(e));
      return false;
    }
  };

  for (const ev of rows) {
    const days = Math.round((dateUtcMs(ev.event_date) - todayMs) / 86400000);
    if (!REMIND_OFFSETS.includes(days)) continue;

    const windowToken = `d${days}`;
    const already = ev.reminders_sent ?? [];
    if (already.includes(windowToken)) continue;

    processed++;
    if (dryRun) continue;

    const typeLabel = TYPE_LABELS[ev.event_type] ?? "Событие по делу";
    const dateStr = fmtRu(ev.event_date);

    // 1) клиенту
    if (ev.notify_client_email) {
      const { data: u } = await supabase.auth.admin.getUserById(ev.user_id);
      const email = u?.user?.email;
      if (email) {
        const ok = await sendEmail(
          email,
          `Напоминание: ${ev.title} — ${whenPhrase(days)}`,
          clientEmailHtml(ev.title, typeLabel, dateStr, days, ev.description),
        );
        if (ok) clientSent++;
        else errors.push(`client:${ev.id}`);
      }
    }

    // 2) закреплённому юристу
    if (ev.notify_lawyer_email) {
      const { data: link } = await supabase
        .from("lawyer_clients")
        .select("lawyer_id, client_name")
        .eq("client_user_id", ev.user_id)
        .eq("link_state", "linked")
        .maybeSingle();
      if (link?.lawyer_id) {
        const { data: lu } = await supabase.auth.admin.getUserById(link.lawyer_id);
        const lawyerEmail = lu?.user?.email;
        if (lawyerEmail) {
          const ok = await sendEmail(
            lawyerEmail,
            `Дедлайн клиента ${link.client_name ?? ""}: ${ev.title} — ${whenPhrase(days)}`,
            lawyerEmailHtml(link.client_name ?? "клиент", ev.title, typeLabel, dateStr, days),
          );
          if (ok) lawyerSent++;
          else errors.push(`lawyer:${ev.id}`);
        }
      }
    }

    // 3) push клиенту — Фаза 3b (service worker + VAPID + таблица подписок). TODO.

    // отметить окно обработанным (идемпотентность в пределах суток)
    const { error: updErr } = await supabase
      .from("case_events")
      .update({ reminders_sent: [...already, windowToken] })
      .eq("id", ev.id);
    if (updErr) errors.push(`update:${ev.id}`);
  }

  return json({
    ok: true,
    dry_run: dryRun,
    today_msk: todayStr,
    scanned: rows.length,
    processed,
    client_emails: clientSent,
    lawyer_emails: lawyerSent,
    errors,
  });
});
