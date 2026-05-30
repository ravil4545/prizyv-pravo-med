// lawyer-extract-date: лёгкий парсер сообщения клиента, который пытается
// извлечь дату повестки/призыва. Используется в чате юриста — когда клиент
// присылает «мне пришла повестка на 15 июня», юристу появляется тост-предложение
// «Заполнить conscription_date = 2026-06-15?».
//
// Возвращает: { found: bool, date_iso: "YYYY-MM-DD" | null, original_phrase: string | null, confidence: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { llmChat, MODEL_FAST, isLlmConfigured } from "../_shared/llmGateway.ts";

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

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Неверный токен" }, { status: 401, headers: corsHeaders(req) });
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return Response.json({ found: false, date_iso: null, original_phrase: null, confidence: 0 }, {
        headers: corsHeaders(req),
      });
    }

    if (!isLlmConfigured()) throw new Error("GROQ_API_KEY не настроен");

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Извлеки из сообщения призывника возможную дату повестки/явки в военкомат/призыва.

Сообщение: "${text.trim().slice(0, 600)}"
Сегодня: ${today}

ВАЖНО:
- Ищи ТОЛЬКО даты в будущем относительно сегодня.
- Если упомянуто «весенний/осенний призыв» без конкретной даты — found: false.
- Если упомянута дата прошедшая — found: false.
- Если дата явно не про военкомат (день рождения, отпуск и т.п.) — found: false.
- Конфиденс 1-100. Если 100% уверен (есть слова «повестка», «явка», «военкомат», «призыв» рядом с датой) — ставь 90+. Если просто упомянута дата без контекста — 30-50.

Отвечай строго в JSON без markdown:
{
  "found": true,
  "date_iso": "2026-06-15",
  "original_phrase": "пришла повестка на 15 июня",
  "confidence": 92
}`;

    const aiRes = await llmChat({
      model: MODEL_FAST,
      temperature: 0,
      maxTokens: 200,
      responseFormat: "json_object",
      messages: [
        { role: "system", content: "Ты лаконичный парсер дат. Отвечай только JSON." },
        { role: "user", content: prompt },
      ],
    });

    if (!aiRes.ok) {
      // Молча возвращаем no-match — это вспомогательная фича, не должна валиться
      return Response.json({ found: false, date_iso: null, original_phrase: null, confidence: 0 }, {
        headers: corsHeaders(req),
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    let result: { found: boolean; date_iso: string | null; original_phrase: string | null; confidence: number };
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : { found: false, date_iso: null, original_phrase: null, confidence: 0 };
    } catch {
      result = { found: false, date_iso: null, original_phrase: null, confidence: 0 };
    }

    // Доп. валидация даты — пускаем только корректные ISO YYYY-MM-DD в будущем.
    if (result.found && result.date_iso) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date_iso)) {
        result = { found: false, date_iso: null, original_phrase: null, confidence: 0 };
      } else {
        const d = new Date(result.date_iso);
        if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() - 86400000) {
          result = { found: false, date_iso: null, original_phrase: null, confidence: 0 };
        }
      }
    }

    return Response.json(result, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("lawyer-extract-date error:", err);
    // Не возвращаем 500 — это «лучшее усилие» функция.
    return Response.json({ found: false, date_iso: null, original_phrase: null, confidence: 0 }, {
      headers: corsHeaders(req),
    });
  }
});
