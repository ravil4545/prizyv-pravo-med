// Единый расчёт сроков для кабинета юриста (планировщик дела + страница «Сроки»).
// Все даты в БД — тип `date` («YYYY-MM-DD»), сравниваем ПО ДНЯМ в локальной зоне,
// без учёта времени, чтобы «сегодня» не зависело от часа и таймзоны сервера.

export type DeadlineBucket = "overdue" | "today" | "tomorrow" | "week" | "later";

/** Разобрать «YYYY-MM-DD» в локальную полночь (без сдвига UTC, как делает new Date(str)). */
export function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Целое число дней от СЕГОДНЯ до даты. Отрицательное — дата в прошлом (просрочка). */
export function daysUntil(dateStr: string, now: Date = new Date()): number | null {
  const target = parseDateOnly(dateStr);
  if (!target) return null;
  const today = startOfDay(now);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Корзина срочности по дате (для группировки повестки). */
export function deadlineBucket(dateStr: string, now: Date = new Date()): DeadlineBucket | null {
  const d = daysUntil(dateStr, now);
  if (d === null) return null;
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "week";
  return "later";
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Короткая человекочитаемая дата «12 июня» (год добавляем, если не текущий). */
export function formatDateRu(dateStr: string, now: Date = new Date()): string {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr;
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Относительная подпись срока: «просрочено на 3 дн.», «сегодня», «через 5 дн.». */
export function formatDueLabel(dateStr: string, now: Date = new Date()): string {
  const d = daysUntil(dateStr, now);
  if (d === null) return "";
  if (d < 0) return `просрочено на ${plural(-d, "день", "дня", "дней")}`;
  if (d === 0) return "сегодня";
  if (d === 1) return "завтра";
  return `через ${plural(d, "день", "дня", "дней")}`;
}

/** Классы цвета для подписи срока по корзине. */
export function deadlineToneClass(bucket: DeadlineBucket): string {
  switch (bucket) {
    case "overdue": return "text-red-600 dark:text-red-400";
    case "today":   return "text-orange-600 dark:text-orange-400";
    case "tomorrow":return "text-amber-600 dark:text-amber-400";
    case "week":    return "text-blue-600 dark:text-blue-400";
    default:        return "text-muted-foreground";
  }
}

export const BUCKET_LABEL: Record<DeadlineBucket, string> = {
  overdue: "Просрочено",
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "На этой неделе",
  later: "Позже",
};

/** Русское склонение числительных: plural(2,'день','дня','дней') → '2 дня'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  let word = many;
  if (a < 11 || a > 14) {
    if (b === 1) word = one;
    else if (b >= 2 && b <= 4) word = few;
  }
  return `${n} ${word}`;
}
