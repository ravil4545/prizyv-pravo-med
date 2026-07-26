import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "npm:resend@4.0.0";
import * as webpush from "jsr:@negrel/webpush@0.3.0";
import { corsHeaders } from "../_shared/cors.ts";
import { vapidKeysToJwk } from "../_shared/vapidKeys.ts";

/**
 * send-deadline-reminders (Модуль 4, Фаза 3 — движок уведомлений).
 *
 * Вызывается ПО РАСПИСАНИЮ (ежедневный cron). Находит события `case_events`,
 * до которых осталось 3 / 1 / 0 дней (сегодня по МСК), и рассылает напоминания:
 *   1) e-mail клиенту           (если notify_client_email);
 *   2) e-mail закреплённому юристу (если notify_lawyer_email и клиент привязан);
 *   3) web-push клиенту           (если notify_client_push и есть VAPID в Vault).
 * Push (Фаза 3b) включается, только когда в Vault лежат vapid_public_key/
 * vapid_private_key и у пользователя есть подписка в push_subscriptions —
 * иначе канал тихо пропускается, e-mail работает как раньше.
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

// Заголовки собираются НА ЗАПРОС по общему белому списку (_shared/cors.ts).
// Раньше здесь стоял const-объект с "Access-Control-Allow-Origin": "*", то есть
// эндпоинт отвечал любой странице в интернете.
const cors = (req: Request) => corsHeaders(req, { methods: "POST, OPTIONS" });

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
  notify_client_push: boolean;
}

// Хелпер принимает req явно. Раньше он звал cors(req) на уровне модуля, где
// никакого req нет — каждый вызов json() падал бы с ReferenceError. Функция
// вызывается по расписанию раз в сутки, поэтому отказ был бы тихим: письма
// просто не уходят, а в ответ никто не смотрит.
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // --- защита: сверяем заголовок с секретом cron_secret из Vault (RPC) ---
  const token = req.headers.get("x-cron-secret") ?? "";
  if (!token) return json(req, { error: "Unauthorized" }, 401);
  const { data: secretOk, error: secretErr } = await supabase.rpc("match_cron_secret", {
    p_token: token,
  });
  if (secretErr) {
    console.error("Secret check failed:", secretErr);
    return json(req, { error: "Secret validation error" }, 500);
  }
  if (secretOk !== true) return json(req, { error: "Unauthorized" }, 401);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json(req, { error: "RESEND_API_KEY not configured" }, 500);

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
      "id,user_id,event_date,event_type,title,description,reminders_sent,notify_client_email,notify_lawyer_email,notify_client_push",
    )
    .eq("remind_enabled", true)
    .gte("event_date", todayStr)
    .lte("event_date", maxStr);

  if (error) {
    console.error("Query error:", error);
    return json(req, { error: "Query failed", detail: error.message }, 500);
  }

  const rows = (events ?? []) as CaseEventRow[];
  let clientSent = 0;
  let lawyerSent = 0;
  let pushSent = 0;
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

  // --- web-push: один раз готовим ApplicationServer из VAPID-ключей (Vault) ---
  // Если ключей нет (Фаза 3b не настроена) — push-канал просто пропускается.
  let pushServer: webpush.ApplicationServer | null = null;
  try {
    const { data: vapid } = await supabase.rpc("get_vapid_keys").single();
    const pub = (vapid as { public_key?: string; private_key?: string } | null)?.public_key;
    const priv = (vapid as { public_key?: string; private_key?: string } | null)?.private_key;
    if (pub && priv) {
      // В Vault лежат base64url-строки, а importVapidKeys ждёт JsonWebKey.
      // Раньше строки передавались как есть: вызов падал, а catch ниже писал
      // «VAPID init skipped» — push молча не работал с июня 2026.
      const keys = await webpush.importVapidKeys(
        vapidKeysToJwk(pub, priv),
        { extractable: false },
      );
      pushServer = await webpush.ApplicationServer.new({
        contactInformation: "mailto:noreply@nepriziv.ru",
        vapidKeys: keys,
      });
    }
  } catch (e) {
    console.error("VAPID init skipped:", String(e));
  }

  // Отправка push на все подписки пользователя; протухшие (404/410) удаляем.
  const sendPush = async (userId: string, title: string, body: string): Promise<boolean> => {
    if (!pushServer) return false;
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) return false;

    const payload = JSON.stringify({ title, body, url: `${SITE}/dashboard/calendar`, tag: "nepriziv-deadline" });
    let anyOk = false;
    for (const s of subs as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        const subscriber = pushServer.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
        await subscriber.pushTextMessage(payload, {});
        anyOk = true;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("404") || msg.includes("410")) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("push send error:", msg);
        }
      }
    }
    return anyOk;
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

    // 3) push клиенту (Фаза 3b): web-push на все подписки, если включено и есть VAPID.
    if (ev.notify_client_push && pushServer) {
      const ok = await sendPush(
        ev.user_id,
        `Напоминание: ${ev.title}`,
        `${typeLabel} — ${whenPhrase(days)} (${dateStr})`,
      );
      if (ok) pushSent++;
    }

    // отметить окно обработанным (идемпотентность в пределах суток)
    const { error: updErr } = await supabase
      .from("case_events")
      .update({ reminders_sent: [...already, windowToken] })
      .eq("id", ev.id);
    if (updErr) errors.push(`update:${ev.id}`);
  }

  return json(req, {
    ok: true,
    dry_run: dryRun,
    today_msk: todayStr,
    scanned: rows.length,
    processed,
    client_emails: clientSent,
    lawyer_emails: lawyerSent,
    push_sent: pushSent,
    errors,
  });
});
