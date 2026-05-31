/**
 * Единое описание типов событий призывного дела (таблица `case_events`).
 *
 * Используется и страницей трекинга дела (таймлайн), и юридическим календарём
 * (Модуль 4), чтобы типы, подписи и цвета совпадали. Подписи намеренно
 * повторяют те, что уже показывает CaseTrackingPage, — UI таймлайна не меняется.
 */

export type CaseEventType =
  | "commission"
  | "appeal"
  | "court"
  | "medical"
  | "document"
  | "other";

export interface CaseEventTypeMeta {
  value: CaseEventType;
  label: string;
  /** Tailwind-класс заливки для точки-маркера в календаре. */
  dot: string;
  /** Tailwind-классы для бейджа типа. */
  badgeClass: string;
}

export const EVENT_TYPES: CaseEventTypeMeta[] = [
  { value: "commission", label: "Призывная комиссия", dot: "bg-rose-500", badgeClass: "bg-rose-500/10 text-rose-600 border-rose-200" },
  { value: "appeal", label: "Обжалование", dot: "bg-amber-500", badgeClass: "bg-amber-500/10 text-amber-600 border-amber-200" },
  { value: "court", label: "Суд", dot: "bg-violet-500", badgeClass: "bg-violet-500/10 text-violet-600 border-violet-200" },
  { value: "medical", label: "Медицинское освидетельствование", dot: "bg-emerald-500", badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  { value: "document", label: "Подача документов", dot: "bg-sky-500", badgeClass: "bg-sky-500/10 text-sky-600 border-sky-200" },
  { value: "other", label: "Другое", dot: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground border-border" },
];

export const OUTCOMES = [
  { value: "positive", label: "Положительный" },
  { value: "negative", label: "Отрицательный" },
  { value: "pending", label: "В ожидании" },
] as const;

const FALLBACK = EVENT_TYPES[EVENT_TYPES.length - 1];

export const eventTypeMeta = (value: string): CaseEventTypeMeta =>
  EVENT_TYPES.find((t) => t.value === value) ?? FALLBACK;

export const eventTypeLabel = (value: string): string => eventTypeMeta(value).label;
