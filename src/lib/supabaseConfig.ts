// ════════════════════════════════════════════════════════════════════════
//  ЕДИНЫЙ источник адреса Supabase и публичного ключа.
//
//  Раньше URL и anon-ключ были захардкожены в 13 местах: клиенте,
//  этом файле, плагине пре-рендера и восьми компонентах, которые дёргают
//  edge-функции прямым fetch. Из-за этого правка .env НЕ переключала
//  окружение — часть приложения продолжала ходить в облако, и заметить это
//  можно было только по факту: половина страниц работает, половина нет.
//  Для переезда на свой сервер (см. план self-host) это блокирующая вещь.
//
//  Теперь значение берётся из окружения, а прежние облачные константы
//  остались запасным вариантом. Такой откат выбран намеренно: сборка в
//  Lovable идёт без нашего .env, и без запасного значения она собрала бы
//  приложение, которое никуда не ходит. Хардкод же ломается «в облако»,
//  то есть в рабочее состояние.
//
//  Anon-ключ публичный — он и так уезжает в браузер с каждым запросом.
//  Секрет здесь только один: его НЕТ. Доступ к данным ограничивает RLS.
// ════════════════════════════════════════════════════════════════════════

/** Значения облачного проекта — используются, если окружение не задано. */
const FALLBACK_URL = "https://kqbetheonxiclwgyatnm.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmV0aGVvbnhpY2x3Z3lhdG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjgxNjAsImV4cCI6MjA3NDkwNDE2MH0.EETf8kfnnN9NgEj_PKup1cLuZbtORz3RjxWuY65KwlI";

/**
 * Значения из окружения. Читаем и import.meta.env (браузер, dev-сервер), и
 * process.env (сборочные скрипты, пре-рендер, тесты) — файл импортируется
 * из обоих контекстов.
 */
function fromEnv(name: string): string | undefined {
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const nodeEnv = typeof process !== "undefined" ? process.env : undefined;
  const value = viteEnv?.[name] ?? nodeEnv?.[name];
  return value?.trim() || undefined;
}

export const SUPABASE_URL = (fromEnv("VITE_SUPABASE_URL") ?? FALLBACK_URL).replace(/\/+$/, "");

export const SUPABASE_ANON_KEY = fromEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  fromEnv("VITE_SUPABASE_ANON_KEY") ??
  FALLBACK_ANON_KEY;

/** Работаем ли мы против облачного проекта (а не своего сервера). */
export const IS_CLOUD_SUPABASE = /\.supabase\.co$/i.test(new URL(SUPABASE_URL).hostname);

/**
 * Адрес edge-функции. Раньше такие ссылки собирались строкой в каждом
 * компоненте — восемь мест, которые при переезде пришлось бы искать руками.
 *
 * Прямой fetch вместо supabase.functions.invoke нужен там, где ответ идёт
 * SSE-стримом: invoke в браузере буферизирует тело целиком, и ответ ИИ
 * появлялся бы разом в конце вместо посимвольного набора.
 */
export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/** Заголовки для прямого fetch к edge-функции. */
export function functionHeaders(accessToken?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
  };
}
