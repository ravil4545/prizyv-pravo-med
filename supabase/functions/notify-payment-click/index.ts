import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Send email via Resend
    if (resendApiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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
          }),
        });
        
        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error('Resend error:', emailRes.status, errBody);
        } else {
          console.log('Email sent successfully');
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
      }
    } else {
      console.warn('RESEND_API_KEY not configured, skipping email');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
