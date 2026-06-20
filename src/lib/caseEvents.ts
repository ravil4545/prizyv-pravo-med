/**
 * Единое описание типов событий призывного дела (таблица `case_events`).
 *
 * Используется и страницей трекинга дела (таймлайн), и юридическим календарём
 * (Модуль 4), чтобы типы, подписи и цвета совпадали. Подписи намеренно
 * повторяют те, что уже показывает CaseTrackingPage, — UI таймлайна не меняется.
 */

import {
  Building2, FileSignature, Gavel, Stethoscope, FileText, Flag,
  MessageSquare, TrendingUp, Sparkles, AlertCircle, Clock, CircleDot,
  type LucideIcon,
} from "lucide-react";

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
  /** Иконка типа — для единой «Ленты дела» (CaseTimeline). */
  icon: LucideIcon;
}

export const EVENT_TYPES: CaseEventTypeMeta[] = [
  { value: "commission", label: "Призывная комиссия", dot: "bg-rose-500", badgeClass: "bg-rose-500/10 text-rose-600 border-rose-200", icon: Building2 },
  { value: "appeal", label: "Обжалование", dot: "bg-amber-500", badgeClass: "bg-amber-500/10 text-amber-600 border-amber-200", icon: FileSignature },
  { value: "court", label: "Суд", dot: "bg-violet-500", badgeClass: "bg-violet-500/10 text-violet-600 border-violet-200", icon: Gavel },
  { value: "medical", label: "Медицинское освидетельствование", dot: "bg-emerald-500", badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: Stethoscope },
  { value: "document", label: "Подача документов", dot: "bg-sky-500", badgeClass: "bg-sky-500/10 text-sky-600 border-sky-200", icon: FileText },
  { value: "other", label: "Другое", dot: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground border-border", icon: Flag },
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

// ─── Типы заметок дела (case_notes) — для единой «Ленты дела» юриста ────────
export interface NoteTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind bg-* для подсветки маркера в ленте. */
  dot: string;
  badgeClass: string;
}

const NOTE_TYPE_META: Record<string, NoteTypeMeta> = {
  note:           { label: "Заметка",        icon: MessageSquare, dot: "bg-slate-400",  badgeClass: "bg-muted text-muted-foreground border-border" },
  stage_change:   { label: "Смена этапа",    icon: TrendingUp,    dot: "bg-blue-500",   badgeClass: "bg-blue-500/10 text-blue-600 border-blue-200" },
  ai_analysis:    { label: "ИИ-анализ",      icon: Sparkles,      dot: "bg-violet-500", badgeClass: "bg-violet-500/10 text-violet-600 border-violet-200" },
  document_added: { label: "Документ",       icon: FileText,      dot: "bg-emerald-500",badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  template_used:  { label: "Шаблон",         icon: FileSignature, dot: "bg-sky-500",    badgeClass: "bg-sky-500/10 text-sky-600 border-sky-200" },
  escalation:     { label: "Запрос клиента", icon: AlertCircle,   dot: "bg-rose-500",   badgeClass: "bg-rose-500/10 text-rose-600 border-rose-200" },
  reminder:       { label: "Напоминание",    icon: Clock,         dot: "bg-amber-500",  badgeClass: "bg-amber-500/10 text-amber-600 border-amber-200" },
};

const NOTE_FALLBACK: NoteTypeMeta = {
  label: "Событие", icon: CircleDot, dot: "bg-slate-400",
  badgeClass: "bg-muted text-muted-foreground border-border",
};

export const noteTypeMeta = (value: string): NoteTypeMeta =>
  NOTE_TYPE_META[value] ?? NOTE_FALLBACK;
