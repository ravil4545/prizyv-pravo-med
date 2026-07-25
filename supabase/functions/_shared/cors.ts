// ════════════════════════════════════════════════════════════════════════
//  Единый CORS для всех edge-функций (§9 предложения / §4.1 аудита).
//
//  ЧТО БЫЛО. Заголовок Access-Control-Allow-Origin стоял в 28 функциях из 29,
//  но реального белого списка не было ни у одной:
//
//    • 6 функций отдавали литерал "*" — включая admin-users (с verify_jwt=false),
//      delete-user-account и import-articles;
//    • 13 функций проверяли белый список и заканчивали строкой
//          return origin || "*";
//      то есть возвращали Origin АТАКУЮЩЕГО. Проверка выше не значила ничего.
//      В эту группу входил весь кабинет юриста — доступ к делам и медданным;
//    • у части проверка на lovable.app шла ПОДСТРОКОЙ (`includes("lovable.app")`),
//      что обходится доменом вида `lovable.app.evil.com`.
//
//  ЧТО СТАЛО. Один модуль, закрытый список, по умолчанию — НИЧЕГО.
//  Если Origin не опознан, заголовок Access-Control-Allow-Origin не ставится
//  вовсе, и браузер не отдаёт ответ чужой странице.
//
//  Non-browser вызовы (cron через pg_net, curl, серверные интеграции) CORS не
//  проверяют вообще — им это ограничение не мешает.
// ════════════════════════════════════════════════════════════════════════

/** Продакшн-домены. www в DNS сейчас нет, но пусть остаётся на будущее. */
const ALLOWED_ORIGINS = new Set([
  "https://nepriziv.ru",
  "https://www.nepriziv.ru",
]);

/** Превью Lovable: строго поддомен .lovable.app, без подстрочных проверок. */
const LOVABLE_PREVIEW = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.lovable\.app$/;

/** Локальная разработка: только localhost/127.0.0.1 с любым портом. */
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/**
 * Разрешён ли Origin. Возвращает сам Origin либо null.
 *
 * ВАЖНО: null — это «не ставим заголовок», а НЕ «ставим звёздочку».
 * Именно подмена null на "*" и была исходной дырой.
 */
export function resolveOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (LOVABLE_PREVIEW.test(origin)) return origin;
  if (LOCALHOST.test(origin)) return origin;

  // Разовое расширение через секрет — например, стенд на своём домене.
  // Сравнение строгое, без includes.
  const extra = Deno.env.get("ALLOWED_ORIGIN");
  if (extra && origin === extra) return origin;

  return null;
}

export interface CorsOptions {
  /** Методы, которые функция реально принимает. По умолчанию POST. */
  methods?: string;
  /** Дополнительные разрешённые заголовки. */
  headers?: string;
}

const DEFAULT_HEADERS = "authorization, x-client-info, apikey, content-type";

/**
 * Заголовки CORS для ответа. Vary: Origin обязателен — иначе CDN закеширует
 * ответ с чужим Access-Control-Allow-Origin и отдаст его другому домену.
 */
export function corsHeaders(req: Request, opts: CorsOptions = {}): Record<string, string> {
  const origin = resolveOrigin(req);
  return {
    "Access-Control-Allow-Headers": opts.headers ?? DEFAULT_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? "POST, OPTIONS",
    "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}

/** То же плюс Content-Type: json — самый частый случай в проекте. */
export function jsonCorsHeaders(req: Request, opts: CorsOptions = {}): Record<string, string> {
  return { ...corsHeaders(req, opts), "Content-Type": "application/json" };
}

/**
 * Ответ на preflight. Возвращает Response для OPTIONS и null для остальных
 * методов — чтобы в функции получалось короткое:
 *
 *     const pre = preflight(req);
 *     if (pre) return pre;
 */
export function preflight(req: Request, opts: CorsOptions = {}): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, opts) });
}
