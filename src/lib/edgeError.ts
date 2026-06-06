/**
 * Достаёт человекочитаемую ошибку из результата `supabase.functions.invoke`.
 *
 * Проблема: при non-2xx ответе edge-функции supabase-js кладёт в `error.message`
 * бесполезное «Edge Function returned a non-2xx status code», а реальный текст
 * (наш `{ error: "..." }` из функции) прячет в `error.context` — это Response.
 * Без распаковки пользователь видит немой сбой вместо причины
 * (например, «OPENAI_API_KEY не настроен» или «таблица не найдена»).
 *
 * Тело читаем ОДИН раз как текст и пробуем разобрать как JSON — повторное
 * чтение Response бросает «body already used».
 */
export async function extractFnError(error: unknown, fallback = "Ошибка сервера"): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const anyErr = error as any;
  const ctx = anyErr?.context;

  if (ctx && typeof ctx.text === "function") {
    try {
      const raw = await ctx.text();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          if (body?.error) return String(body.error);
          if (body?.message) return String(body.message);
        } catch {
          // тело не JSON — отдаём как есть (обрезав)
          return raw.slice(0, 300);
        }
      }
    } catch {
      // не удалось прочитать тело — упадём на message ниже
    }
  }

  if (anyErr?.message) return String(anyErr.message);
  return fallback;
}
