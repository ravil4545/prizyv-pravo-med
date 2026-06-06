// ════════════════════════════════════════════════════════════════════════
//  LLMGateway — единая точка доступа к OpenAI API (ТЗ §0.1, §0.3).
//
//  Модель/URL/ключ — ТОЛЬКО из окружения, без хардкода в агентах. Смена
//  модели — секретами Supabase, без правок кода агентов.
//
//  Ретраи с экспоненциальной паузой на 429/503.
//
//  Совместимость моделей (compat-шим в llmChat):
//    • OpenAI использует `max_completion_tokens` (а не `max_tokens`).
//    • reasoning-семейства (gpt-5*, o1/o3/o4…) НЕ принимают кастомную
//      temperature — для них её НЕ отправляем (берётся дефолтная).
//
//  ⚠️ Vision: content сообщения может быть массивом частей (text + image_url),
//     поэтому vision-функции тоже могут ходить через этот шлюз.
// ════════════════════════════════════════════════════════════════════════

const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

// Модели переопределяются env. Сохранены имена экспортов MODEL_MAIN/MODEL_FAST,
// чтобы вызывающие функции не менялись.
export const MODEL_MAIN = Deno.env.get("OPENAI_MODEL_MAIN") || "gpt-4.1-mini";
export const MODEL_FAST = Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4.1-nano";

export const isLlmConfigured = (): boolean => !!OPENAI_API_KEY;

// reasoning-модели (gpt-5*, o1/o3/o4…) не принимают кастомную temperature.
const isReasoningModel = (model: string): boolean => /^(gpt-5|o\d)/i.test(model);

// Сообщение чата. content допускает массив частей (vision: text+image_url).
// Допускает поля function-calling (tool_calls, tool_call_id, name) — OpenAI.
export interface LlmMessage {
  role: string;
  // deno-lint-ignore no-explicit-any
  content: string | any[] | null;
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmTool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface LlmChatOpts {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  stream?: boolean;
  responseFormat?: "json_object";
  maxTokens?: number;
  signal?: AbortSignal;
  maxRetries?: number;
  // Function-calling (ТЗ §2.2): инструменты агентов + стратегия выбора.
  tools?: LlmTool[];
  toolChoice?: "auto" | "none" | "required";
}

/**
 * Вызов OpenAI chat/completions. Возвращает сырой Response:
 * стрим-режим отдаётся вызывающему как есть (он пробрасывает res.body),
 * non-stream — caller сам читает res.json(). Ретраи на 429/503 — внутри.
 */
export async function llmChat(opts: LlmChatOpts): Promise<Response> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY не настроен");

  const {
    messages,
    model = MODEL_MAIN,
    temperature = 0.3,
    stream = false,
    responseFormat,
    maxTokens,
    signal,
    maxRetries = 3,
    tools,
    toolChoice,
  } = opts;

  const payload: Record<string, unknown> = { model, messages, stream };

  // OpenAI: max_completion_tokens; temperature только для не-reasoning моделей.
  if (!isReasoningModel(model)) payload.temperature = temperature;
  if (maxTokens) payload.max_completion_tokens = maxTokens;

  if (responseFormat) payload.response_format = { type: responseFormat };
  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice ?? "auto";
  }
  const body = JSON.stringify(payload);

  let res!: Response;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
        ? Math.min(retryAfter, 15)
        : Math.min(2 + attempt * 3, 15);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    return res; // не-ретраиваемая ошибка или последняя попытка — разберёт caller
  }
  return res;
}
