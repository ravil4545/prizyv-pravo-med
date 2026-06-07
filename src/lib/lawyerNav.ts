import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  FileText,
  BarChart3,
  Palette,
  Search,
  CalendarClock,
} from "lucide-react";

/**
 * ЕДИНЫЙ ИСТОЧНИК НАВИГАЦИИ КАБИНЕТА ЮРИСТА — зеркало клиентского cabinetNav.
 * Один список рендерится и как десктоп-сайдбар (LawyerLayout), и как мобильные
 * нижние табы (4 первичных) + лист «Ещё» (вторичные). Раньше навигацию юриста
 * давал общий MobileBottomNav (lawyer-вариант) без сайдбара — теперь единообразно
 * с клиентом.
 */
export interface LawyerNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Глобальный маршрут без брендового варианта — не префиксуем (не используется у юриста). */
  external?: boolean;
  /** Бейдж непрочитанных сообщений от клиентов. */
  messagesBadge?: boolean;
}

/** Первичные: нижние табы (порядок = порядок табов). Чаты — акцентный центр. */
export const LAWYER_PRIMARY_NAV: LawyerNavItem[] = [
  { label: "Кабинет", to: "/lawyer", icon: LayoutDashboard },
  { label: "Клиенты", to: "/lawyer/clients", icon: Users },
  { label: "Чаты", to: "/lawyer/chats", icon: MessageSquare, messagesBadge: true },
  { label: "Шаблоны", to: "/lawyer/templates", icon: FileText },
];

/** Вторичные: сайдбар ниже разделителя и лист «Ещё». */
export const LAWYER_SECONDARY_NAV: LawyerNavItem[] = [
  { label: "Сроки", to: "/lawyer/agenda", icon: CalendarClock },
  { label: "Аналитика", to: "/lawyer/analytics", icon: BarChart3 },
  { label: "Бренд и white-label", to: "/lawyer/branding", icon: Palette },
  { label: "Каталог юристов", to: "/lawyers", icon: Search, external: true },
];

/**
 * Путь относится к рабочему кабинету юриста (/lawyer, /lawyer/*). НЕ совпадает с
 * публичным каталогом /lawyers (после «lawyer» идёт «s»). На этих маршрутах
 * Header/Footer/MobileBottomNav не рендерятся — хром даёт LawyerLayout. Чат-тред
 * /lawyer/chat/* ВХОДИТ (на десктопе сайдбар есть), но LawyerLayout прячет у него
 * мобильные бары (см. isChatThread в cabinetNav).
 */
export function isLawyerPath(pathname: string): boolean {
  return /^\/lawyer(\/|$)/.test(pathname);
}
