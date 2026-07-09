// ════════════════════════════════════════════════════════════════════════
//  aiUsage — учёт расхода ИИ в ₽ и rate-limit анонимных вызовов.
//
//  Зачем: подписка 4990₽/мес, расход токенов ИИ на подписчика не должен
//  превышать ~1650₽/мес. Цены ниже — ПРИБЛИЗИТЕЛЬНЫЕ (публичные прайсы
//  Groq/OpenAI на момент написания) — при смене провайдера/модели (см.
//  OPENAI_BASE_URL/OPENAI_MODEL_* в llmGateway.ts) сверить с реальным счётом
//  и поправить MODEL_PRICING_USD_PER_1M. Для неизвестной модели берётся
//  намеренно завышенная цена (FALLBACK) — лучше рано включить деградацию,
//  чем молча недосчитать расход.
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

const RUB_PER_USD = Number(Deno.env.get("AI_RUB_PER_USD")) || 90;

// USD за 1M токенов: [input, output].
const MODEL_PRICING_USD_PER_1M: Record<string, [number, number]> = {
  "llama-3.3-70b-versatile": [0.59, 0.79],
  "llama-3.1-8b-instant": [0.05, 0.08],
  "gpt-5.6": [5.00, 30.00],
  "gpt-5.6-sol": [5.00, 30.00],
  "gpt-5.6-terra": [2.50, 15.00],
  "gpt-5.6-luna": [1.00, 6.00],
  "gpt-5.5": [5.00, 30.00],
  "gpt-4.1-mini": [0.40, 1.60],
  "gpt-4.1-nano": [0.10, 0.40],
};
const FALLBACK_PRICING_USD_PER_1M: [number, number] = [5.00, 30.00];

export function computeCostRub(model: string, promptTokens: number, completionTokens: number): number {
  const [inPrice, outPrice] = MODEL_PRICING_USD_PER_1M[model] || FALLBACK_PRICING_USD_PER_1M;
  const usd = (promptTokens / 1_000_000) * inPrice + (completionTokens / 1_000_000) * outPrice;
  return usd * RUB_PER_USD;
}

export function getServiceRoleClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// IP → SHA-256 hex (16 симв.) — сырой IP не храним (152-ФЗ).
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

// Фоновая задача ПОСЛЕ ответа клиенту (Supabase Edge Runtime) — не задерживает response.
// deno-lint-ignore no-explicit-any
export function waitUntil(promise: Promise<unknown>): void {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(promise);
  else promise.catch(() => {});
}

export interface UsageCtx {
  userId?: string | null;
  ipHash?: string | null;
  functionName: string;
  model: string;
}

export async function recordUsage(
  admin: AdminClient,
  ctx: UsageCtx & { promptTokens: number; completionTokens: number },
): Promise<void> {
  try {
    const cost_rub = computeCostRub(ctx.model, ctx.promptTokens, ctx.completionTokens);
    await admin.from("ai_usage_events").insert({
      user_id: ctx.userId || null,
      ip_hash: ctx.ipHash || null,
      function_name: ctx.functionName,
      model: ctx.model,
      prompt_tokens: ctx.promptTokens,
      completion_tokens: ctx.completionTokens,
      cost_rub,
    });
  } catch (e) {
    console.error("[aiUsage] recordUsage failed (non-blocking):", e);
  }
}

export async function getMonthlySpendRub(admin: AdminClient, userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  try {
    const { data, error } = await admin
      .from("ai_usage_events")
      .select("cost_rub")
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString());
    if (error || !data) return 0;
    // deno-lint-ignore no-explicit-any
    return data.reduce((sum: number, r: any) => sum + Number(r.cost_rub), 0);
  } catch (e) {
    console.error("[aiUsage] getMonthlySpendRub failed, failing open:", e);
    return 0;
  }
}

export type BudgetTier = "normal" | "degraded" | "blocked";

export function pickBudgetTier(spentRub: number, budgetRub: number, hardStopMultiplier: number): BudgetTier {
  if (spentRub >= budgetRub * hardStopMultiplier) return "blocked";
  if (spentRub >= budgetRub) return "degraded";
  return "normal";
}

// Rate-limit анонимных вызовов: N запросов в сутки (UTC) на IP на функцию.
// Fail-open при сбое БД — сбой инфраструктуры не должен блокировать пользователей.
export async function checkAnonRateLimit(
  admin: AdminClient,
  functionName: string,
  ipHash: string,
  maxPerDay: number,
): Promise<boolean> {
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data, error } = await admin.rpc("bump_ai_rate_limit", {
      p_key: `${functionName}:${ipHash}`,
      p_window_start: dayStart.toISOString(),
      p_max_requests: maxPerDay,
    });
    if (error) {
      console.error("[aiUsage] rate limit check failed, failing open:", error);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error("[aiUsage] rate limit check threw, failing open:", e);
    return true;
  }
}

// Извлекает usage из хвоста SSE-стрима (нужен stream_options.include_usage
// через llmChat({trackUsage: true})) и пишет леджер. stream — ВТОРАЯ половина
// res.body.tee(): клиенту уходит первая половина нетронутой, эта читается в
// фоне через waitUntil, ответ пользователю не задерживает.
export async function captureStreamUsageAndRecord(
  stream: ReadableStream<Uint8Array>,
  admin: AdminClient,
  ctx: UsageCtx,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          if (json.usage) usage = json.usage;
        } catch {
          // частичный/невалидный чанк — игнор, это не последний usage-чанк
        }
      }
    }
  } catch (e) {
    console.error("[aiUsage] stream usage capture failed:", e);
  }
  if (usage) {
    await recordUsage(admin, {
      ...ctx,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
    });
  }
}
