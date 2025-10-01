import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Track submissions by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 1; // 1 submission per 5 minutes

// Contact form validation schema
const contactFormSchema = z.object({
  name: z.string()
    .trim()
    .min(2, { message: "Имя должно содержать минимум 2 символа" })
    .max(100, { message: "Имя должно содержать максимум 100 символов" }),
  phone: z.string()
    .trim()
    .regex(/^[\d\s+()-]+$/, { message: "Недопустимый формат телефона" })
    .min(10, { message: "Телефон должен содержать минимум 10 цифр" })
    .max(18, { message: "Телефон должен содержать максимум 18 символов" }),
  email: z.string()
    .trim()
    .email({ message: "Недопустимый формат email" })
    .max(255, { message: "Email должен содержать максимум 255 символов" })
    .optional()
    .or(z.literal("")),
  message: z.string()
    .trim()
    .min(10, { message: "Сообщение должно содержать минимум 10 символов" })
    .max(2000, { message: "Сообщение должно содержать максимум 2000 символов" }),
});

function checkRateLimit(ipAddress: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ipAddress);

  // Clean up expired entries
  if (record && now > record.resetTime) {
    rateLimitMap.delete(ipAddress);
  }

  const currentRecord = rateLimitMap.get(ipAddress);

  if (!currentRecord) {
    // First request from this IP
    rateLimitMap.set(ipAddress, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true };
  }

  if (currentRecord.count >= MAX_REQUESTS_PER_WINDOW) {
    const remainingTime = Math.ceil((currentRecord.resetTime - now) / 60000); // Convert to minutes
    return { allowed: false, remainingTime };
  }

  // Increment counter
  currentRecord.count += 1;
  return { allowed: true };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP address from headers
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() 
      || req.headers.get('x-real-ip') 
      || 'unknown';
    
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Check rate limiting
    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Слишком частые запросы',
          message: `Пожалуйста, подождите ${rateLimitCheck.remainingTime} мин. перед следующей заявкой`
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = contactFormSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: 'Ошибка валидации',
          details: validation.error.errors.map(err => ({
            field: err.path[0],
            message: err.message
          }))
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client with service role for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert validated data into database
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert({
        name: validation.data.name,
        phone: validation.data.phone,
        email: validation.data.email || '',
        message: validation.data.message,
        ip_address: clientIp,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({
          error: 'Ошибка сохранения',
          message: 'Не удалось сохранить заявку. Попробуйте позже.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Заявка успешно отправлена',
        id: data.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Внутренняя ошибка сервера',
        message: 'Произошла непредвиденная ошибка. Попробуйте позже.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
