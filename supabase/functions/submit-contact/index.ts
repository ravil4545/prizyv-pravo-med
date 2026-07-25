import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { Resend } from "npm:resend@4.0.0";

// CORS configuration - restrict to production domain in production
const getAllowedOrigin = () => {
  const origin = Deno.env.get("ALLOWED_ORIGIN");
  return origin || "*"; // Default to * for development
};

const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Track submissions by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 1; // 1 submission per 5 minutes

// Contact form validation schema
const AGE_VALUES = ["17", "18", "19", "20", "21", "22-25", "26-27", "27+"] as const;
const STAGE_VALUES = ["povestka", "medcommission", "decision", "court", "ai_only", "other"] as const;

const STAGE_LABELS: Record<string, string> = {
  povestka: "Повестка пришла",
  medcommission: "Готовлюсь к медкомиссии",
  decision: "Не согласен с решением комиссии",
  court: "Прохожу обжалование в суде",
  ai_only: "Хочу попробовать ИИ-кабинет",
  other: "Другое",
};

// «Горячие» стадии — требуют срочного звонка, помечаются 🔥 в админ-письме.
const URGENT_STAGES = new Set(["povestka", "decision", "court"]);

// Карта источников лид-магнитов → PDF, который надо отдать.
// Используется и при exit-intent (фиксированный чек-лист), и при выборе
// конкретного магнита через LeadMagnetBox на блоге/диагнозах.
interface LeadMagnetInfo {
  pdfUrl: string;
  pdfTitle: string;
  pdfDescription: string;
}

const LEAD_MAGNETS: Record<string, LeadMagnetInfo> = {
  "exit_intent": {
    pdfUrl: "https://nepriziv.ru/leadmagnets/checklist-medcomission.pdf",
    pdfTitle: "Чек-лист подготовки к медкомиссии",
    pdfDescription:
      "9 пунктов подготовки, типичные ошибки и нормативные ссылки на ФЗ-53, ФЗ-323 и Постановление №565.",
  },
  "lead_magnet:checklist_medcomission": {
    pdfUrl: "https://nepriziv.ru/leadmagnets/checklist-medcomission.pdf",
    pdfTitle: "Чек-лист подготовки к медкомиссии",
    pdfDescription: "9 пунктов: документы, врачи, как фиксировать действия комиссии.",
  },
  "lead_magnet:guide_povestka": {
    pdfUrl: "https://nepriziv.ru/leadmagnets/guide-povestka.pdf",
    pdfTitle: "Что делать в день получения повестки",
    pdfDescription: "План на 72 часа: что подписывать, что нет, кому звонить.",
  },
  "lead_magnet:matrix_565": {
    pdfUrl: "https://nepriziv.ru/leadmagnets/matrix-565.pdf",
    pdfTitle: "Матрица «Диагноз → статья 565»",
    pdfDescription: "40 диагнозов и их привязка к Расписанию болезней.",
  },
  "lead_magnet:template_appeal": {
    pdfUrl: "https://nepriziv.ru/leadmagnets/template-apellyaciya.pdf",
    pdfTitle: "Шаблон апелляции в комиссию субъекта",
    pdfDescription: "Готовый юридический документ с пояснениями.",
  },
};

const getLeadMagnet = (source: string | undefined): LeadMagnetInfo | null => {
  if (!source) return null;
  return LEAD_MAGNETS[source] ?? null;
};

// Телефон стал опциональным (был обязательным, min 10 цифр).
// Из-за этого требования фронтенд подставлял фиктивный "+70000000000" в
// заявках за лид-магниты и в exit-intent — база заявок засорялась номерами,
// по которым невозможно перезвонить. Теперь достаточно любого одного канала
// связи: телефона ИЛИ email.
const contactFormSchema = z.object({
  name: z.string()
    .trim()
    .min(2, { message: "Имя должно содержать минимум 2 символа" })
    .max(100, { message: "Имя должно содержать максимум 100 символов" }),
  phone: z.string()
    .trim()
    .regex(/^[\d\s+()-]+$/, { message: "Недопустимый формат телефона" })
    .min(10, { message: "Телефон должен содержать минимум 10 цифр" })
    .max(18, { message: "Телефон должен содержать максимум 18 символов" })
    .optional()
    .or(z.literal("")),
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
  age: z.enum(AGE_VALUES).optional(),
  stage: z.enum(STAGE_VALUES).optional(),
  source: z.string().max(64).optional(),
}).refine(
  (d) => Boolean(d.phone?.trim()) || Boolean(d.email?.trim()),
  { message: "Укажите телефон или email — иначе мы не сможем ответить", path: ["phone"] },
);

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

    // Parse and validate request body
    const body = await req.json();
    const validation = contactFormSchema.safeParse(body);

    // Rate limit пропускает запросы лид-магнитов — пользователь может скачать
    // несколько материалов подряд. Контакт-форму ограничиваем как раньше.
    const isLeadMagnet = validation.success && getLeadMagnet(validation.data.source) !== null;

    if (!isLeadMagnet) {
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
    }

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

    const urgent = validation.data.stage ? URGENT_STAGES.has(validation.data.stage) : false;
    const stageLabel = validation.data.stage ? STAGE_LABELS[validation.data.stage] : null;

    // Insert validated data into database
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert({
        name: validation.data.name,
        // Колонка NOT NULL без дефолта — пустая строка вместо фиктивного номера.
        phone: validation.data.phone || '',
        email: validation.data.email || '',
        message: validation.data.message,
        age: validation.data.age || null,
        stage: validation.data.stage || null,
        source: validation.data.source || 'contact_form',
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

    // Send confirmation email to user if email provided
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const magnet = getLeadMagnet(validation.data.source);

    if (resendApiKey && validation.data.email) {
      try {
        const resend = new Resend(resendApiKey);

        if (magnet) {
          // Письмо-доставка лид-магнита: тема, превью и крупная кнопка
          // ведут на PDF, размещённый в /public/leadmagnets/.
          await resend.emails.send({
            from: 'nepriziv.ru <onboarding@resend.dev>',
            to: [validation.data.email],
            subject: `📎 Ваш материал: ${magnet.pdfTitle}`,
            html: `
              <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#faf7f0;padding:32px;color:#0a0a0a;">
                <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:#8a6d35;margin-bottom:12px;">
                  NEPRIZIV.RU · ЛИД-МАГНИТ
                </div>
                <h1 style="font-size:24px;line-height:1.2;margin:0 0 8px;color:#0a0a0a;">
                  Ваш материал готов.
                </h1>
                <p style="font-style:italic;color:#8a6d35;margin:0 0 24px;font-size:16px;">
                  — ${magnet.pdfTitle}
                </p>
                <p style="font-size:14px;line-height:1.6;color:#4a4a4a;margin:0 0 24px;">
                  ${magnet.pdfDescription}
                </p>
                <a href="${magnet.pdfUrl}"
                   style="display:inline-block;background:#b08d4a;color:#0a0a0a;padding:14px 28px;text-decoration:none;font-weight:bold;font-size:14px;border:2px solid #b08d4a;font-family:Arial,sans-serif;">
                  📥 Скачать PDF
                </a>
                <p style="margin-top:24px;font-size:12px;color:#6b6b6b;line-height:1.5;">
                  Если кнопка не работает — скопируйте ссылку в браузер:<br>
                  <a href="${magnet.pdfUrl}" style="color:#8a6d35;word-break:break-all;">${magnet.pdfUrl}</a>
                </p>
                <hr style="border:none;border-top:1px solid #d8d2c4;margin:32px 0;">
                <p style="font-size:13px;line-height:1.6;color:#4a4a4a;margin:0 0 12px;">
                  Этот материал — навигатор. Конкретное решение для вашей ситуации
                  требует анализа документов и личного дела.
                </p>
                <p style="font-size:13px;line-height:1.6;color:#4a4a4a;margin:0 0 8px;">
                  <strong>Бесплатный разбор за 15 минут:</strong>
                </p>
                <p style="font-size:13px;line-height:1.6;color:#0a0a0a;margin:0 0 24px;">
                  📞 <a href="tel:+79253500533" style="color:#0a0a0a;">+7 (925) 350-05-33</a><br>
                  💬 <a href="https://t.me/nepriziv2" style="color:#0a0a0a;">Telegram</a> ·
                  <a href="https://wa.me/79253500533" style="color:#0a0a0a;">WhatsApp</a>
                </p>
                <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#8a6d35;margin:0;border-top:1px solid #d8d2c4;padding-top:16px;">
                  Юрист Важанина А.Е. · 10+ лет · 500+ дел
                </p>
              </div>
            `,
          });
        } else {
          // Обычное письмо-подтверждение заявки с контакт-формы
          await resend.emails.send({
            from: 'НеПризыв <onboarding@resend.dev>',
            to: [validation.data.email],
            subject: 'Ваша заявка принята — nepriziv.ru',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#1a1a2e;">Заявка принята!</h2>
                <p>Здравствуйте, ${validation.data.name}!</p>
                <p>${validation.data.phone
                  ? `Мы получили вашу заявку и свяжемся с вами в ближайшее время по телефону <strong>${validation.data.phone}</strong>.`
                  : `Мы получили вашу заявку и ответим на этот адрес в ближайшее время.`}</p>
                <div style="background:#f8f9fa;border-left:4px solid #6366f1;padding:16px;border-radius:4px;margin:16px 0;">
                  <p style="margin:0;font-weight:bold;">Ваше сообщение:</p>
                  <p style="margin:8px 0 0;color:#374151;">${validation.data.message}</p>
                </div>
                <p>Обычно мы отвечаем в течение 1–2 рабочих часов.</p>
                <a href="https://nepriziv.ru/dashboard/ai-chat"
                   style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px;font-weight:600;">
                  Попробовать ИИ-консультант
                </a>
                <p style="margin-top:24px;color:#6b7280;font-size:12px;">nepriziv.ru — правовая защита призывников</p>
              </div>
            `,
          });
        }
      } catch (emailErr) {
        console.error('Confirmation email error:', emailErr);
      }
    }

    // Notify admin
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        await resend.emails.send({
          from: 'НеПризыв <onboarding@resend.dev>',
          to: ['ravil4545@gmail.com'],
          subject: `${urgent ? '🔥 СРОЧНО — ' : '📩 '}Заявка: ${validation.data.name}${stageLabel ? ' · ' + stageLabel : ''}`,
          html: `
            <h2>${urgent ? '🔥 СРОЧНАЯ заявка с сайта' : 'Новая заявка с сайта'}</h2>
            <table style="border-collapse:collapse;">
              <tr><td style="padding:4px 12px;font-weight:bold;">Имя:</td><td style="padding:4px 12px;">${validation.data.name}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Телефон:</td><td style="padding:4px 12px;">${validation.data.phone ? `<a href="tel:${validation.data.phone}">${validation.data.phone}</a>` : '—'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Email:</td><td style="padding:4px 12px;">${validation.data.email || '—'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Возраст:</td><td style="padding:4px 12px;">${validation.data.age || '—'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Стадия:</td><td style="padding:4px 12px;${urgent ? 'color:#c0392b;font-weight:bold;' : ''}">${stageLabel || '—'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Источник:</td><td style="padding:4px 12px;">${validation.data.source || 'contact_form'}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Сообщение:</td><td style="padding:4px 12px;">${validation.data.message}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">Дата:</td><td style="padding:4px 12px;">${now}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold;">IP:</td><td style="padding:4px 12px;">${clientIp}</td></tr>
            </table>
          `,
        });
      } catch (emailErr) {
        console.error('Admin email error:', emailErr);
      }
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
