import type { LucideIcon } from "lucide-react";
import {
  Home,
  CalendarClock,
  MessageSquare,
  FileHeart,
  Briefcase,
  User,
  Calendar,
  ClipboardList,
  BookOpen,
  FileText,
  Users,
  Search,
} from "lucide-react";

/**
 * ЕДИНЫЙ ИСТОЧНИК НАВИГАЦИИ КЛИЕНТСКОГО КАБИНЕТА.
 *
 * Один список пунктов, из которого рендерятся ОБА представления:
 *  - десктоп — левый сайдбар (DashboardLayout, `hidden md:flex`);
 *  - мобайл  — нижние табы (4 первичных) + лист «Ещё» (вторичные).
 *
 * Раньше сайдбар (DashboardLayout) и нижняя навигация (MobileBottomNav) были
 * двумя независимыми списками и разъезжались (разный состав, «Главная» вела в
 * разные места). Теперь правка пунктов — в одном месте, рассинхрон невозможен.
 */
export interface CabinetNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Глобальный маршрут без брендового варианта `/u/:slug/*` — не префиксуем. */
  external?: boolean;
  /** Показывать бейдж непрочитанных сообщений от юриста. */
  messagesBadge?: boolean;
}

/** Первичные действия (ТЗ): всегда на виду, ≤1 тап. Порядок = порядок табов. */
export const PRIMARY_NAV: CabinetNavItem[] = [
  { label: "Главная", to: "/dashboard", icon: Home },
  { label: "Дело", to: "/dashboard/case-tracking", icon: CalendarClock },
  { label: "ИИ-консультант", to: "/dashboard/ai-chat", icon: MessageSquare },
  { label: "Документы", to: "/dashboard/medical-documents", icon: FileHeart },
];

/** Вторичные: доступны, но не доминируют — в сайдбаре ниже разделителя и в «Ещё». */
export const SECONDARY_NAV: CabinetNavItem[] = [
  { label: "Чат с юристом", to: "/client/messages", icon: Briefcase, messagesBadge: true },
  { label: "Профиль и подписка", to: "/profile", icon: User },
  { label: "Мой календарь", to: "/dashboard/calendar", icon: Calendar },
  { label: "Опросник для ИИ", to: "/medical-questionnaire", icon: ClipboardList },
  { label: "Расписание болезней", to: "/medical-history", icon: BookOpen },
  { label: "Шаблоны заявлений", to: "/dashboard/templates", icon: FileText },
  { label: "Семейный доступ", to: "/family", icon: Users },
  { label: "Найти юриста", to: "/lawyers", icon: Search, external: true },
];

/**
 * Совпадает ли путь со страницей клиентского кабинета (обёрнутой в
 * DashboardLayout). Используется, чтобы Header/Footer/MobileBottomNav
 * НЕ рендерились в кабинете — там навигацию даёт DashboardLayout, иначе
 * получается двойной «хром».
 *
 * Маршруты под DashboardLayout (App.tsx): /dashboard(/*), /medical-history,
 * /medical-questionnaire, /profile, /client/messages, /family — и их брендовые
 * зеркала /u/:slug/... НЕ входят: полноэкранные чат-треды /client/chat/* (см.
 * isChatThread) и кабинет юриста /lawyer/* (своя обвязка LawyerLayout).
 */
const CABINET_RX = /^(\/dashboard(\/|$)|\/medical-history(\/|$)|\/medical-questionnaire(\/|$)|\/profile(\/|$)|\/client\/messages(\/|$)|\/family$)/;

export function isCabinetPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/u\/[^/]+/, "") || "/";
  return CABINET_RX.test(stripped);
}

/**
 * Полноэкранный чат-тред (1:1) — /lawyer/chat/* и /client/chat/* (+ /u/:slug).
 * Эти страницы используют `h-screen overflow-hidden` с собственной шапкой и
 * полем ввода, прижатым к низу: их НЕ оборачиваем в shell и НЕ показываем
 * нижние табы (иначе поле ввода уезжает под них). Header у них свой — НЕ
 * подавляется (isCabinetPath/isLawyerPath возвращают для них false).
 */
export function isChatThread(pathname: string): boolean {
  const stripped = pathname.replace(/^\/u\/[^/]+/, "") || "/";
  return /^\/(lawyer|client)\/chat(\/|$)/.test(stripped);
}
