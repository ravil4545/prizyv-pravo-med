// ════════════════════════════════════════════════════════════════════════
//  LLMGateway — единая точка доступа к LLM (ТЗ §0.1, §0.3).
//
//  • Провайдер по умолчанию — Groq (OpenAI-совместим, open-source модели).
//  • Модель/URL/ключ — ТОЛЬКО из окружения, без хардкода в агентах.
//    Смена модели/провайдера — конфигом, без правок кода агентов.
//  • Ретраи с экспоненциальной паузой на 429/503 (free-tier Groq: ~30 RPM,
//    ~6K TPM, ~1K RPD — лимиты строгие).
//
//  ⚠️ Vision: Groq НЕ читает изображения. OCR/анализ картинок идёт отдельным
//     путём (analyze-medical-document на Gemini), сюда не маршрутизируется.
//
//  TODO (ТЗ §0.1, следующий шаг): собственный суточный счётчик RPD
//     (Groq не отдаёт RPD в заголовках; сброс в полночь UTC) — таблица +
//     проверка перед вызовом, чтобы не упереться в потолок незаметно.
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_BASE_URL = Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const RPD_LIMIT = Number(Deno.env.get("GROQ_RPD_LIMIT") || "1000");

// Модели — из каталога Groq, переопределяются через env (см. ТЗ §0.3).
export const MODEL_MAIN = Deno.env.get("GROQ_MODEL_MAIN") || "llama-3.3-70b-versatile";
export const MODEL_FAST = Deno.env.get("GROQ_MODEL_FAST") || "llama-3.1-8b-instant";

export const isLlmConfigured = (): boolean => !!GROQ_API_KEY;

// ── Суточный RPD-счётчик (best-effort, fail-open) ───────────────────────────
let _sb: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (_sb) return _sb;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _sb = createClient(url, key);
  return _sb;
}

// Инкрементит суточный счётчик модели и возвращает {ok, count}. При любой
// ошибке БД — fail-open (ok=true), чтобы счётчик не блокировал ИИ.
async function checkRpd(model: string): Promise<{ ok: boolean; count: number }> {
  try {
    const c = getServiceClient();
    if (!c) return { ok: true, count: 0 };
    const { data, error } = await c.rpc("llm_increment_rpd", { p_model: model });
    if (error) {
      console.error("[LLMGateway] RPD rpc error:", error.message);
      return { ok: true, count: 0 };
    }
    const count = Number(data) || 0;
    return { ok: count <= RPD_LIMIT, count };
  } catch (e) {
    console.error("[LLMGateway] RPD check failed:", e instanceof Error ? e.message : e);
    return { ok: true, count: 0 };
  }
}

export interface LlmChatOpts {
  messages: { role: string; content: string }[];
  model?: string;
  temperature?: number;
  stream?: boolean;
  responseFormat?: "json_object";
  maxTokens?: number;
  signal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Вызов chat/completions у провайдера. Возвращает сырой Response (ok или нет):
 * стрим-режим отдаётся вызывающему как есть (он пробрасывает res.body),
 * non-stream — caller сам читает res.json(). Ретраи на 429/503 — внутри.
 */
export async function llmChat(opts: LlmChatOpts): Promise<Response> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не настроен");

  const {
    messages,
    model = MODEL_MAIN,
    temperature = 0.3,
    stream = false,
    responseFormat,
    maxTokens,
    signal,
    maxRetries = 3,
  } = opts;

  const payload: Record<string, unknown> = { model, messages, temperature, stream };
  if (responseFormat) payload.response_format = { type: responseFormat };
  if (maxTokens) payload.max_tokens = maxTokens;
  const body = JSON.stringify(payload);

  // P0.1 (ТЗ §0.1): суточный лимит запросов. Инкрементим счётчик; при упоре
  // отдаём синтетический 429 (caller обработает как обычный rate-limit).
  const rpd = await checkRpd(model);
  if (!rpd.ok) {
    console.warn(`[LLMGateway] RPD limit ${rpd.count}/${RPD_LIMIT} for ${model}`);
    return new Response(
      JSON.stringify({ error: "Дневной лимит запросов к ИИ исчерпан. Попробуйте позже." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let res!: Response;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });

    if (res.ok) return res;

    // 429 (лимит) / 503 — транзиентные: ждём и повторяем.
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitSec = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 10)
        : Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    return res; // не-ретраиваемая ошибка или последняя попытка — разберёт caller
  }
  return res;
}
