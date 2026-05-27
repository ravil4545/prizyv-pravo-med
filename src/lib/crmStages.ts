// Единый источник CRM-этапов для всего кабинета юриста.
// Дублирование стадий в 5 страницах + 2 edge functions было основной причиной
// рассинхрона визуала (одни и те же этапы окрашены в разные семьи цветов)
// и хрупкости при добавлении/переименовании.
//
// Любое изменение CRM-воронки делается ТОЛЬКО здесь.

import {
  Phone, Stethoscope, ClipboardCheck, Search, BadgeCheck,
  Hourglass, FolderCheck, Building2, Scale, Gavel, Trophy,
  type LucideIcon,
} from "lucide-react";

export type CrmStageValue =
  | "initial_contact"
  | "no_diagnosis"
  | "has_diagnosis"
  | "examinations"
  | "diagnosis_confirmed"
  | "waiting_documents"
  | "documents_received"
  | "military_office"
  | "regional_commission"
  | "courts"
  | "military_ticket";

export interface CrmStageDef {
  value: CrmStageValue;
  /** Короткий лейбл для бейджей и колонок Канбана */
  label: string;
  /** Тон бейджа: bg + text для светлой темы (содержит и dark: варианты) */
  badgeClass: string;
  /** Тон полосы для воронки/прогресса (плотный bg, для гистограмм) */
  barClass: string;
  /** Иконка для канбана/таймлайна */
  icon: LucideIcon;
  /** True для финальной победной стадии (выделяем особенно) */
  isWin?: boolean;
}

/**
 * Канонический порядок — это путь дела сверху вниз.
 * Воронки и сортировки опираются на индекс в этом массиве.
 */
export const CRM_STAGES: CrmStageDef[] = [
  {
    value: "initial_contact",
    label: "Первичный контакт",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    barClass: "bg-slate-400",
    icon: Phone,
  },
  {
    value: "no_diagnosis",
    label: "Нет диагноза",
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    barClass: "bg-orange-400",
    icon: Stethoscope,
  },
  {
    value: "has_diagnosis",
    label: "Есть диагноз",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    barClass: "bg-blue-400",
    icon: ClipboardCheck,
  },
  {
    value: "examinations",
    label: "Обследования",
    badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
    barClass: "bg-cyan-400",
    icon: Search,
  },
  {
    value: "diagnosis_confirmed",
    label: "Диагноз получен",
    badgeClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    barClass: "bg-indigo-400",
    icon: BadgeCheck,
  },
  {
    value: "waiting_documents",
    label: "Ожидание документов",
    badgeClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
    barClass: "bg-yellow-400",
    icon: Hourglass,
  },
  {
    value: "documents_received",
    label: "Документы получены",
    badgeClass: "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300",
    barClass: "bg-lime-400",
    icon: FolderCheck,
  },
  {
    value: "military_office",
    label: "Военкомат",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    barClass: "bg-purple-400",
    icon: Building2,
  },
  {
    value: "regional_commission",
    label: "Комиссия субъекта",
    badgeClass: "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
    barClass: "bg-pink-400",
    icon: Scale,
  },
  {
    value: "courts",
    label: "Суды",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    barClass: "bg-red-400",
    icon: Gavel,
  },
  {
    value: "military_ticket",
    label: "Получение ВБ",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
    barClass: "bg-green-500",
    icon: Trophy,
    isWin: true,
  },
];

/** Канонический порядок (массив value's) — для сортировок воронки */
export const CRM_STAGE_ORDER: CrmStageValue[] = CRM_STAGES.map((s) => s.value);

/** Быстрый lookup-объект: value → label */
export const CRM_STAGE_LABELS: Record<string, string> = Object.fromEntries(
  CRM_STAGES.map((s) => [s.value, s.label]),
);

/** Быстрый lookup-объект: value → badgeClass */
export const CRM_STAGE_BADGE_CLASS: Record<string, string> = Object.fromEntries(
  CRM_STAGES.map((s) => [s.value, s.badgeClass]),
);

/** Быстрый lookup-объект: value → barClass */
export const CRM_STAGE_BAR_CLASS: Record<string, string> = Object.fromEntries(
  CRM_STAGES.map((s) => [s.value, s.barClass]),
);

/** Получить определение этапа по value (с safe-fallback'ом). */
export const getStageDef = (value: string): CrmStageDef | undefined =>
  CRM_STAGES.find((s) => s.value === value);

/** Индекс этапа в воронке (0..10). -1 если этап неизвестный. */
export const getStageIndex = (value: string): number =>
  CRM_STAGE_ORDER.indexOf(value as CrmStageValue);

// ─── Priorities — для бейджей в карточках клиента ─────────────────────────
export type PriorityValue = "urgent" | "high" | "normal" | "low";

export interface PriorityDef {
  value: PriorityValue;
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const PRIORITIES: PriorityDef[] = [
  { value: "urgent", label: "Срочный", badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",        dotClass: "bg-red-500" },
  { value: "high",   label: "Высокий", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", dotClass: "bg-orange-400" },
  { value: "normal", label: "Обычный", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",     dotClass: "bg-blue-400" },
  { value: "low",    label: "Низкий",  badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",     dotClass: "bg-slate-400" },
];

export const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p.label]),
);
