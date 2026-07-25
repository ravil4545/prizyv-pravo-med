// ════════════════════════════════════════════════════════════════════════
//  Архивная нумерация разделов «№ NN» — единый реестр.
//
//  Номера проставлялись руками в каждом компоненте и разъехались с порядком
//  рендера: пользователь на главной видел 09 → 11 → (без номера) → 10,
//  Credentials и BlogPreview были без номера вовсе, а DiagnosesPage дублировала
//  № 07 у SubscriptionPricing.
//
//  Теперь номер — производная от позиции в этом списке. Порядок здесь ДОЛЖЕН
//  совпадать с порядком рендера в src/pages/Index.tsx; переставили секцию —
//  переставили строку здесь, и номера пересчитаются сами.
// ════════════════════════════════════════════════════════════════════════

/** Секции главной страницы — строго в порядке рендера Index.tsx. */
const HOME_SECTIONS = [
  "hero",
  "about",
  "credentials",
  "map",
  "cases",
  "services",
  "pricing",
  "subscription",
  "ai-features",
  "testimonials",
  "faq",
  "blog",
  "contact",
] as const;

/** Самостоятельные страницы — нумерация продолжается после главной. */
const STANDALONE_PAGES = [
  "review",
  "diagnoses",
  "privacy",
  "terms",
  "offer",
  "requisites",
] as const;

export type SectionKey = (typeof HOME_SECTIONS)[number] | (typeof STANDALONE_PAGES)[number];

const ORDER: readonly SectionKey[] = [...HOME_SECTIONS, ...STANDALONE_PAGES];

/**
 * «№ 04» для секции. Номер = позиция в ORDER, считая с единицы.
 * Неизвестный ключ — заметная заглушка «№ ??», а не молчаливый сбой.
 */
export function sectionNumber(key: SectionKey): string {
  const index = ORDER.indexOf(key);
  if (index < 0) return "№ ??";
  return `№ ${String(index + 1).padStart(2, "0")}`;
}

/**
 * Exit-intent намеренно вне последовательности: это не раздел досье, а
 * всплывающее окно. Отсюда «№ 00».
 */
export const OUT_OF_SEQUENCE = "№ 00";
