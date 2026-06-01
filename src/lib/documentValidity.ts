import { differenceInCalendarDays, addDays, parseISO, isValid } from "date-fns";

/**
 * «Срок годности» медицинских документов (Модуль 2 — удержание).
 *
 * Военкоматы и медкомиссии принимают свежие справки/анализы — у многих
 * документов ограниченный срок актуальности. Здесь по типу/названию документа
 * оцениваем срок годности и считаем, сколько дней осталось. Это НЕ юридическая
 * гарантия (точные сроки зависят от учреждения), а ориентир, который снижает
 * тревожность и подсказывает, что пора обновить.
 *
 * Источник даты — document_date (дата на справке); если её нет, опираемся на
 * uploaded_at как на консервативную замену. Сроки — типовые ориентиры:
 *   • анализы крови/мочи        — ~14 дней
 *   • ЭКГ, флюорография/рентген — ~180 дней (ФЛГ — год, берём строже к одному)
 *   • справки/выписки           — ~180 дней
 *   • заключения специалистов   — ~365 дней
 * Не классифицированные/прочие — без срока (бессрочно по умолчанию).
 */

export type ValidityLevel = "fresh" | "soon" | "expired" | "none";

export interface DocumentValidity {
  level: ValidityLevel;
  /** Сколько дней осталось до конца срока (может быть отрицательным). null — без срока. */
  daysLeft: number | null;
  /** Готовая человекочитаемая подпись. */
  label: string;
  /** Срок годности в днях для этого типа (null — бессрочно). */
  validForDays: number | null;
}

// Ключевые слова → срок годности в днях. Порядок важен: первый матч выигрывает.
const RULES: { test: RegExp; days: number }[] = [
  { test: /(общий\s+)?анализ\s+(крови|мочи)|оак|оам|биохими/i, days: 14 },
  { test: /экг|кардиограмм/i, days: 180 },
  { test: /флюорограф|флг|рентген|ренгтен|ккф/i, days: 180 },
  { test: /узи|эхо|ээг|эхокг/i, days: 180 },
  { test: /справк|выписк|эпикриз/i, days: 180 },
  { test: /заключени|консультац|осмотр|приём|прием/i, days: 365 },
];

const PLURAL = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

export const daysWord = (n: number) => PLURAL(n, "день", "дня", "дней");

/** Определяет срок годности (в днях) по названию/типу документа. */
export function validityDaysFor(titleOrType: string | null | undefined): number | null {
  if (!titleOrType) return null;
  for (const rule of RULES) if (rule.test.test(titleOrType)) return rule.days;
  return null;
}

interface ComputeArgs {
  /** Дата на документе (YYYY-MM-DD) — приоритетна. */
  documentDate?: string | null;
  /** Когда загружен — запасная дата отсчёта. */
  uploadedAt?: string | null;
  /** Название документа — для определения типа. */
  title?: string | null;
  /** Доп. строка типа (если есть). */
  typeName?: string | null;
}

const toDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
};

/**
 * Считает актуальность документа на сегодня.
 * `today` можно передать для тестов; по умолчанию — текущая дата.
 */
export function computeValidity(args: ComputeArgs, today: Date = new Date()): DocumentValidity {
  const validForDays = validityDaysFor(args.title) ?? validityDaysFor(args.typeName);
  if (validForDays === null) {
    return { level: "none", daysLeft: null, label: "Бессрочно", validForDays: null };
  }

  const base = toDate(args.documentDate) ?? toDate(args.uploadedAt);
  if (!base) {
    return { level: "none", daysLeft: null, label: "Дата не указана", validForDays };
  }

  const expiresOn = addDays(base, validForDays);
  const daysLeft = differenceInCalendarDays(expiresOn, today);

  if (daysLeft < 0) {
    return {
      level: "expired",
      daysLeft,
      label: "Истёк — нужно обновить для военкомата",
      validForDays,
    };
  }
  if (daysLeft <= 14) {
    return {
      level: "soon",
      daysLeft,
      label: `Действует ещё ${daysLeft} ${daysWord(daysLeft)} — скоро обновить`,
      validForDays,
    };
  }
  return {
    level: "fresh",
    daysLeft,
    label: `Действует ещё ${daysLeft} ${daysWord(daysLeft)}`,
    validForDays,
  };
}
