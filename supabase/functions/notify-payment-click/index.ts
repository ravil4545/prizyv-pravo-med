import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "npm:resend@4.0.0";
import { corsHeaders } from "../_shared/cors.ts";

// Заголовки собираются НА ЗАПРОС по общему белому списку (_shared/cors.ts).
// Раньше здесь стоял const-объект с "Access-Control-Allow-Origin": "*" — то есть
// эндпоинт отвечал любой странице в интернете. Для admin-users, удаления
// аккаунта и импорта статей это особенно скверно.
const cors = (req: Request) => corsHeaders(req, { methods: "POST, OPTIONS" });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    let userEmail = 'Неизвестный пользователь';
    let userId = 'unknown';
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userEmail = user.email || 'без email';
        userId = user.id;
      }
    }

    // Get profile info
    let fullName = '';
    let phone = '';
    if (userId !== 'unknown') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', userId)
        .single();
      if (profile) {
        fullName = profile.full_name || '';
        phone = profile.phone || '';
      }
    }

    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    // Record click in user_subscriptions
    if (userId !== 'unknown') {
      await supabase
        .from('user_subscriptions')
        .update({ payment_link_clicked_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    // Save to contact_submissions as backup
    const { error: dbError } = await supabase
      .from('contact_submissions')
      .insert({
        name: `Оплата подписки: ${fullName || userEmail}`,
        phone: phone || '-',
        email: 'ravil4545@gmail.com',
        message: `Пользователь перешёл на страницу оплаты подписки.\n\nEmail: ${userEmail}\nID: ${userId}\nИмя: ${fullName || 'не указано'}\nТелефон: ${phone || 'не указан'}\nДата: ${now}`,
        status: 'payment_click',
      });

    if (dbError) {
      console.error('Error saving to DB:', dbError);
    }

    // Send email via Resend SDK
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'НеПризыв <onboarding@resend.dev>',
          to: ['ravil4545@gmail.com'],
          subject: `💳 Переход к оплате: ${fullName || userEmail}`,
          html: `
            <h2>Пользователь перешёл на страницу оплаты</h2>
            <table style="border-collapse:collapse;">
              <tr><td style="padding:4px 12px;font-weight:bold;">Email:</td><td style="padding:4px 12px;">${userEmail}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Имя:</td><td style="padding:4px 12px;">${fullName || 'не указано'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Телефон:</td><td style="padding:4px 12px;">${phone || 'не указан'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">ID:</td><td style="padding:4px 12px;">${userId}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Дата:</td><td style="padding:4px 12px;">${now}</td></tr>
            </table>
          `,
        });

        if (emailError) {
          console.error('Resend email error:', JSON.stringify(emailError));
        } else {
          console.log('Email sent successfully, id:', emailData?.id);
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
      }
    } else {
      console.warn('RESEND_API_KEY not configured, skipping email');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...cors(req), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...cors(req), 'Content-Type': 'application/json' } }
    );
  }
});
