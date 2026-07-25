// ════════════════════════════════════════════════════════════════════════
//  Категории годности (ст. 5.1 53-ФЗ, Положение о ВВЭ).
//
//  В таблице `diagnoses` колонка `category` хранит именно категорию годности
//  (реальные значения: Б, В, Г, Д) — но в интерфейсе она нигде не подписана,
//  и буква сама по себе человеку ничего не говорит. Этот модуль — единое
//  место, где буква превращается в понятный текст.
//
//  Используется в каталоге диагнозов; дальше пригодится в карте пути дела и
//  в чек-листах.
// ════════════════════════════════════════════════════════════════════════

export type FitnessCategory = "А" | "Б" | "В" | "Г" | "Д";

export interface FitnessCategoryInfo {
  /** Буква как в Расписании болезней. */
  code: FitnessCategory;
  /** Короткая подпись для бейджа. */
  short: string;
  /** Что это значит для призывника — человеческим языком. */
  meaning: string;
  /** Освобождает ли от призыва (для акцента в интерфейсе). */
  exempt: boolean;
  /** Классы Tailwind для бейджа в editorial-палитре. */
  badgeClass: string;
}

export const FITNESS_CATEGORIES: Record<FitnessCategory, FitnessCategoryInfo> = {
  "А": {
    code: "А",
    short: "годен",
    meaning: "Годен к военной службе без ограничений.",
    exempt: false,
    badgeClass: "border-ink/25 text-ink/70",
  },
  "Б": {
    code: "Б",
    short: "годен с ограничениями",
    meaning: "Годен с незначительными ограничениями — призыв возможен, меняется род войск.",
    exempt: false,
    badgeClass: "border-ink/25 text-ink/70",
  },
  "В": {
    code: "В",
    short: "освобождение",
    meaning: "Ограниченно годен: освобождение от призыва, зачисление в запас, военный билет.",
    exempt: true,
    badgeClass: "border-gold text-gold-deep bg-gold/10",
  },
  "Г": {
    code: "Г",
    short: "отсрочка",
    meaning: "Временно не годен — отсрочка на 6–12 месяцев для лечения и дообследования.",
    exempt: false,
    badgeClass: "border-seal/40 text-seal",
  },
  "Д": {
    code: "Д",
    short: "не годен",
    meaning: "Не годен к военной службе: полное освобождение, снятие с воинского учёта.",
    exempt: true,
    badgeClass: "border-gold text-gold-deep bg-gold/10",
  },
};

/** Порядок показа: сначала то, что интересует призывника больше всего. */
export const CATEGORY_DISPLAY_ORDER: FitnessCategory[] = ["В", "Д", "Г", "Б", "А"];

export function isFitnessCategory(value: string | null | undefined): value is FitnessCategory {
  return !!value && value in FITNESS_CATEGORIES;
}

export function categoryInfo(value: string | null | undefined): FitnessCategoryInfo | null {
  return isFitnessCategory(value) ? FITNESS_CATEGORIES[value] : null;
}

/**
 * Сортировка статей Расписания болезней по номеру.
 * В БД `article_number` — text, поэтому `.order("article_number")` даёт
 * 1, 10, 11, …, 2, 20 — статья 2 оказывается после статьи 19.
 */
export function compareArticleNumbers(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b, "ru");
  if (na !== nb) return na - nb;
  return a.localeCompare(b, "ru");
}
