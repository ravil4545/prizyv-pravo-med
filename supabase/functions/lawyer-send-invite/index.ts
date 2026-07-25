// lawyer-send-invite: юрист одним кликом отправляет клиенту приглашение
// на email через Resend.
//
// Сценарии:
//   • Карточка в state pending_client_approval — отправляем письмо со ссылкой
//     /dashboard?lawyer_invite=hint (визуальный хинт + явное упоминание
//     блока «Запросы от юристов»). Клиент после логина увидит запрос и
//     примет/отклонит его одной кнопкой.
//   • Карточка в state code_sent — отправляем письмо с 8-символьным кодом
//     приглашения и прямой deep-link ?lawyer_invite=CODE.
//
// Безопасность:
//   • Проверяем JWT юриста.
//   • Проверяем что lawyer_client_id принадлежит этому юристу.
//   • Email-получатель берётся из target_email/client_email на сервере,
//     юрист не может подсунуть произвольный адрес.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "npm:resend@4.0.0";
import { corsHeaders } from "../_shared/cors.ts";

// Заголовки собираются НА ЗАПРОС по общему белому списку (_shared/cors.ts).
// Раньше здесь стоял const-объект с "Access-Control-Allow-Origin": "*", то есть
// эндпоинт отвечал любой странице в интернете.
const cors = (req: Request) => corsHeaders(req, { methods: "POST, OPTIONS" });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY не настроен в Supabase секретах" }),
        { status: 500, headers: { ...cors(req), "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Требуется авторизация" }), {
        status: 401, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    // Кто вызывает
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Неверный токен" }), {
        status: 401, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const { lawyerClientId, overrideEmail } = await req.json();
    if (!lawyerClientId) {
      return new Response(JSON.stringify({ error: "lawyerClientId обязателен" }), {
        status: 400, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    // Сервисным ключом достаём карточку и lawyer_profiles (для подписи письма).
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: card, error: cardErr } = await admin
      .from("lawyer_clients")
      .select("id, lawyer_id, client_name, client_email, target_email, invite_code, link_state")
      .eq("id", lawyerClientId)
      .single();
    if (cardErr || !card) {
      return new Response(JSON.stringify({ error: "Карточка не найдена" }), {
        status: 404, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }
    if (card.lawyer_id !== user.id) {
      return new Response(JSON.stringify({ error: "Нет доступа: чужая карточка" }), {
        status: 403, headers: { ...cors(req), "Content-Type": "application/json" },
      });
    }

    const recipientEmail =
      (typeof overrideEmail === "string" && overrideEmail.trim()) ||
      card.target_email ||
      card.client_email;
    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return new Response(
        JSON.stringify({ error: "У карточки нет email клиента — заполните его в кабинете" }),
        { status: 400, headers: { ...cors(req), "Content-Type": "application/json" } },
      );
    }

    // Имя юриста для подписи
    const { data: lp } = await admin
      .from("lawyer_profiles")
      .select("full_name, brand_subtitle, slug")
      .eq("user_id", card.lawyer_id)
      .maybeSingle();
    const lawyerName = (lp as any)?.full_name || "Ваш юрист";
    const lawyerSubtitle = (lp as any)?.brand_subtitle || "Юрист по призывному и медицинскому праву";
    const lawyerSlug = (lp as any)?.slug || null;

    // Сценарий 1 (pending_client_approval): уже привязанный аккаунт.
    // Сценарий 2 (code_sent): отправляем код + deep-link.
    const isCodeFlow = card.link_state === "code_sent" && card.invite_code;
    const dashboardUrl = isCodeFlow
      ? `https://nepriziv.ru/dashboard?lawyer_invite=${card.invite_code}`
      : `https://nepriziv.ru/dashboard`;

    const clientName = (card.client_name || "").trim() || "коллега";
    const codeBlock = isCodeFlow
      ? `
        <p style="font-size:14px;color:#374151;margin-top:24px;">
          Если автоматический переход не сработал — введите код вручную в кабинете
          (раздел «У меня есть код от юриста»):
        </p>
        <div style="text-align:center;margin:16px 0;">
          <span style="font-family:'SF Mono',Menlo,monospace;font-size:28px;font-weight:bold;letter-spacing:0.3em;color:#1f2937;background:#f3f4f6;padding:12px 24px;border-radius:8px;display:inline-block;">
            ${escapeHtml(card.invite_code as string)}
          </span>
        </div>`
      : `
        <p style="font-size:14px;color:#374151;margin-top:16px;">
          После входа в кабинет вы увидите блок <strong>«Запросы от юристов»</strong> —
          подтвердите подключение одной кнопкой.
        </p>`;

    const ctaLabel = isCodeFlow ? "Принять приглашение" : "Открыть кабинет и принять запрос";

    const resend = new Resend(resendApiKey);
    const { error: sendErr } = await resend.emails.send({
      from: "НеПризыв <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Приглашение от ${lawyerName} — nepriziv.ru`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
          <h2 style="color:#1a1a2e;margin-bottom:8px;">Юрист хочет работать с вами через nepriziv.ru</h2>
          <p style="color:#6b7280;font-size:14px;margin-top:0;">${escapeHtml(lawyerSubtitle)}</p>

          <p>Здравствуйте, ${escapeHtml(clientName)}!</p>
          <p>
            <strong>${escapeHtml(lawyerName)}</strong> приглашает вас в защищённый кабинет
            на nepriziv.ru. После подтверждения юрист получит доступ к вашим медицинским
            документам и ИИ-анализам, а вы — к чату с ним прямо на сайте.
          </p>

          <p style="margin-top:16px;color:#374151;font-size:14px;">
            <strong>Доступ можно отозвать в любой момент</strong> одной кнопкой в личном кабинете.
          </p>

          ${codeBlock}

          <div style="text-align:center;margin:24px 0;">
            <a href="${dashboardUrl}"
              style="display:inline-block;background:#6366f1;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
              ${ctaLabel}
            </a>
          </div>

          ${lawyerSlug ? `
            <p style="font-size:12px;color:#6b7280;margin-top:24px;text-align:center;">
              Или откройте страницу юриста:
              <a href="https://nepriziv.ru/u/${escapeHtml(lawyerSlug)}" style="color:#6366f1;">nepriziv.ru/u/${escapeHtml(lawyerSlug)}</a>
            </p>` : ""}

          <p style="margin-top:32px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">
            Если письмо пришло по ошибке — просто проигнорируйте его. Никаких действий
            на вашей стороне без явного подтверждения в кабинете не произойдёт.
          </p>
        </div>
      `,
    });

    if (sendErr) {
      console.error("Resend error:", sendErr);
      return new Response(
        JSON.stringify({ error: `Не удалось отправить письмо: ${sendErr.message || "unknown"}` }),
        { status: 500, headers: { ...cors(req), "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipientEmail }), {
      status: 200, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("lawyer-send-invite error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Внутренняя ошибка" }), {
      status: 500, headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
});
