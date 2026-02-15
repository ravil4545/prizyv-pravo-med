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
    if (userId !== 'unknown') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', userId)
        .single();
      if (profile) {
        fullName = profile.full_name || '';
      }
    }

    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

    // Send email notification via Supabase Auth admin API (using inbuilt email)
    // Since we don't have a dedicated email service, we'll use a simple approach:
    // Store notification in contact_submissions as a workaround
    const { error } = await supabase
      .from('contact_submissions')
      .insert({
        name: `Оплата подписки: ${fullName || userEmail}`,
        phone: '-',
        email: 'ravil4545@gmail.com',
        message: `Пользователь перешёл на страницу оплаты подписки.\n\nEmail: ${userEmail}\nID: ${userId}\nИмя: ${fullName || 'не указано'}\nДата: ${now}`,
        status: 'payment_click',
      });

    if (error) {
      console.error('Error saving notification:', error);
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
