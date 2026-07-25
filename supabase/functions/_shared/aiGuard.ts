// ════════════════════════════════════════════════════════════════════════
//  Суточный лимит на дорогие ИИ-вызовы (§9 предложения).
//
//  ЗАЧЕМ. Из 29 edge-функций лимит стоял ровно у трёх (chat, chat-rag и
//  case-review). При этом analyze-medical-document делает ДВА vision-запроса к
//  OpenAI на документ, parse-summons и generate-appeal — по обычному запросу,
//  а месячный бюджет проекта задан в 1650 ₽ (AI_MONTHLY_BUDGET_RUB). Один
//  скрипт, гоняющий загрузку документов по кругу, выжигает его за вечер.
//
//  Ключ лимита — пользователь, если запрос авторизован, и хеш IP, если нет.
//  По пользователю честнее: за общим NAT (общежитие, офис, мобильный оператор)
//  сидят разные люди, и лимит по IP наказывал бы невиновных.
//
//  Fail-open: если БД недоступна, запрос ПРОПУСКАЕМ. Отказать человеку в
//  разборе документов из-за сбоя счётчика хуже, чем пропустить лишний вызов.
// ════════════════════════════════════════════════════════════════════════

import { checkAnonRateLimit, getClientIp, hashIp } from "./aiUsage.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface DailyLimitOptions {
  req: Request;
  admin: AdminClient;
  /** Имя функции — часть ключа лимита. */
  functionName: string;
  /** id пользователя, если запрос авторизован. */
  userId?: string | null;
  /** Значение по умолчанию, если переменная окружения не задана. */
  fallbackMax: number;
  /** Имя переменной окружения с лимитом. */
  envKey?: string;
  /** Заголовки ответа (CORS). */
  headers: Record<string, string>;
  /** Что показать человеку при исчерпании. */
  message?: string;
}

/**
 * Проверяет суточный лимит. Возвращает готовый ответ 429 либо null, если
 * запрос можно пропускать дальше.
 */
export async function enforceDailyLimit(opts: DailyLimitOptions): Promise<Response | null> {
  const max = Number(
    (opts.envKey ? Deno.env.get(opts.envKey) : undefined) ?? opts.fallbackMax,
  );
  if (!Number.isFinite(max) || max <= 0) return null;

  // Авторизован — считаем по пользователю; нет — по хешу IP (сырой IP не
  // сохраняем, 152-ФЗ).
  const identity = opts.userId
    ? `user:${opts.userId}`
    : `ip:${await hashIp(getClientIp(opts.req))}`;

  const allowed = await checkAnonRateLimit(opts.admin, opts.functionName, identity, max);
  if (allowed) return null;

  return new Response(
    JSON.stringify({
      error: opts.message ??
        `Сегодня доступно ${max} запросов к этой функции. Попробуйте завтра или напишите юристу.`,
      rateLimited: true,
    }),
    { status: 429, headers: { ...opts.headers, "Content-Type": "application/json" } },
  );
}
