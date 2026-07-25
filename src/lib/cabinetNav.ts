import type { LucideIcon } from "lucide-react";
import {
  Home,
  CalendarClock,
  MessageSquare,
  MessagesSquare,
  FileHeart,
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

/**
 * Первичные действия: всегда на виду, ≤1 тап. Порядок = порядок табов.
 *
 * Было 4 + 8 = 12 пунктов для человека, который зашёл впервые и в стрессе.
 * Причём часть из них — не разделы, а шаги внутри одного процесса: опросник
 * заполняется один раз, «Расписание болезней» — это публичный справочник
 * /diagnoses, шаблоны нужны в момент, когда до них дошёл юридический чек-лист.
 *
 * Теперь 4 + 3 = 7, и каждый оставшийся пункт — МЕСТО, а не действие.
 * Выброшенные из меню инструменты не потеряны: они собраны блоком «Инструменты
 * дела» на странице «Моё дело», то есть там, где реально нужны.
 */
export const PRIMARY_NAV: CabinetNavItem[] = [
  { label: "Моё дело", to: "/dashboard", icon: Home },
  { label: "Документы", to: "/dashboard/medical-documents", icon: FileHeart },
  { label: "ИИ-консультант", to: "/dashboard/ai-chat", icon: MessageSquare },
  { label: "Юрист", to: "/client/messages", icon: MessagesSquare, messagesBadge: true },
];

/** Вторичные: доступны, но не доминируют — в сайдбаре ниже разделителя и в «Ещё». */
export const SECONDARY_NAV: CabinetNavItem[] = [
  { label: "Ведение дела и сроки", to: "/dashboard/case-tracking", icon: CalendarClock },
  { label: "Профиль и подписка", to: "/profile", icon: User },
  { label: "Семейный доступ", to: "/family", icon: Users },
];

/**
 * Инструменты, убранные из основного меню. Показываются блоком на странице
 * ведения дела — рядом с картой пути и чек-листами, где они и нужны.
 * Маршруты никуда не делись, изменилась только точка входа.
 */
export const CASE_TOOLS: CabinetNavItem[] = [
  { label: "Шаблоны заявлений", to: "/dashboard/templates", icon: FileText },
  { label: "Опросник для ИИ", to: "/medical-questionnaire", icon: ClipboardList },
  // Это НЕ публичный справочник /diagnoses, а личная сверка: статьи РБ рядом
  // с загруженными документами и оценкой ИИ. Прежняя подпись «Расписание
  // болезней» вводила в заблуждение — она совпадала с названием публичной
  // страницы, хотя ведёт в совсем другое место.
  { label: "Мои статьи и документы", to: "/medical-history", icon: BookOpen },
  { label: "Мой календарь", to: "/dashboard/calendar", icon: Calendar },
  { label: "Найти юриста", to: "/lawyers", icon: Search, external: true },
];

/**
 * Совпадает ли путь со страницей клиентского кабинета (обёрнутой в
 * DashboardLayout). Используется, чтобы Header/Footer/MobileBottomNav
 * НЕ рендерились в кабинете — там навигацию даёт DashboardLayout, иначе
 * получается двойной «хром».
 *
 * Маршруты под DashboardLayout (App.tsx): /dashboard(/*), /medical-history,
 * /medical-questionnaire, /profile, /client/* (инбокс И чат-тред), /family,
 * /lawyers (каталог — флоу подбора юриста) — и их брендовые зеркала /u/:slug/...
 * Чат-треды /client/chat/* и /dashboard/ai-chat ВХОДЯТ (на десктопе сайдбар
 * есть), но DashboardLayout прячет у них мобильные верх/низ-бары (см.
 * isChatThread). НЕ входит /lawyer/* (своя обвязка LawyerLayout).
 */
const CABINET_RX = /^(\/dashboard(\/|$)|\/medical-history(\/|$)|\/medical-questionnaire(\/|$)|\/profile(\/|$)|\/client(\/|$)|\/family$|\/lawyers(\/|$))/;

export function isCabinetPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/u\/[^/]+/, "") || "/";
  return CABINET_RX.test(stripped);
}

/**
 * Полноэкранный чат-тред — /lawyer/chat/*, /client/chat/* и AI-чат
 * /dashboard/ai-chat (+ /u/:slug).
 * Эти страницы используют `h-screen overflow-hidden` с собственной шапкой и
 * полем ввода, прижатым к низу: их НЕ оборачиваем в shell и НЕ показываем
 * нижние табы (иначе поле ввода уезжает под них). Header у них свой — НЕ
 * подавляется (isCabinetPath/isLawyerPath возвращают для них false).
 */
export function isChatThread(pathname: string): boolean {
  const stripped = pathname.replace(/^\/u\/[^/]+/, "") || "/";
  return /^\/(lawyer|client)\/chat(\/|$)/.test(stripped) || /^\/dashboard\/ai-chat(\/|$)/.test(stripped);
}

/**
 * Маршруты админки /admin/* — свой хром (AdminLayout): сайтовые
 * Header/Footer/MobileBottomNav на них не рендерятся, как и в кабинетах.
 */
export function isAdminPath(pathname: string): boolean {
  return /^\/admin(\/|$)/.test(pathname);
}
