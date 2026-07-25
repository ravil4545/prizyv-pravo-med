// ════════════════════════════════════════════════════════════════════════
//  Единый источник правды по бесплатному лимиту публичного ИИ.
//
//  До этого обещание расходилось в четырёх местах:
//    • Hero, чип           — «1 вопрос ИИ — бесплатно»
//    • /ai, плашка         — «Бесплатно, без регистрации» (лимит не назван)
//    • AiChatPage          — FREE_LIMIT = 3 (реальное поведение)
//    • RagChat (виджет)    — лимита нет вообще
//
//  Теперь и число, и формулировки берутся отсюда. Меняем лимит — меняется
//  везде разом, рассинхрон невозможен.
// ════════════════════════════════════════════════════════════════════════

/** Сколько вопросов публичный ИИ отвечает без регистрации. */
export const PUBLIC_AI_FREE_LIMIT = 3;

/** localStorage-ключ счётчика заданных вопросов (общий для /ai и виджета). */
export const PUBLIC_AI_COUNT_KEY = "nepriziv_ai_public_count";

/** Короткая подпись под полем ввода: «Бесплатно · без регистрации · 3 вопроса». */
export const PUBLIC_AI_FREE_LABEL =
  `Бесплатно · без регистрации · ${PUBLIC_AI_FREE_LIMIT} ${plural(PUBLIC_AI_FREE_LIMIT, "вопрос", "вопроса", "вопросов")}`;

/**
 * «Осталось 2 из 3» — честный счётчик вместо внезапно исчезающего поля ввода.
 * Возвращает null, когда показывать нечего (лимит исчерпан либо пользователь вошёл).
 */
export function remainingLabel(asked: number): string | null {
  const left = Math.max(0, PUBLIC_AI_FREE_LIMIT - asked);
  if (left <= 0) return null;
  return `Осталось ${left} из ${PUBLIC_AI_FREE_LIMIT} бесплатных ${plural(left, "вопроса", "вопросов", "вопросов")}`;
}

/** Русское склонение по числу: 1 вопрос / 2 вопроса / 5 вопросов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
