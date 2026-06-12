import { useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { MoreHorizontal, LogOut, MessageSquare, ChevronRight, Briefcase, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { withBrandPath } from "@/lib/brandPath";
import { PRIMARY_NAV, SECONDARY_NAV, isChatThread, type CabinetNavItem } from "@/lib/cabinetNav";
import EmergencyAuditButton from "@/components/EmergencyAuditButton";
import LimitsBadge from "@/components/LimitsBadge";
import CabinetChooserDialog from "@/components/CabinetChooserDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import { supabase } from "@/integrations/supabase/client";

const LEGAL_LINKS = [
  { to: "/privacy", label: "Конфиденциальность" },
  { to: "/terms", label: "Условия" },
  { to: "/offer", label: "Оферта" },
  { to: "/requisites", label: "Реквизиты" },
];

/**
 * Обвязка клиентского кабинета (единственный «хром» внутри кабинета).
 *
 * Header и Footer сайта на кабинетных маршрутах не рендерятся (см.
 * isCabinetPath в lib/cabinetNav) — навигацию целиком даёт этот layout:
 *  - десктоп: левый сайдбар (первичные + вторичные пункты + аккаунт);
 *  - мобайл:  компактная верхняя панель + нижние табы (4 первичных + «Ещё»).
 *
 * Оба представления берут пункты из ОДНОГО конфига (PRIMARY_NAV/SECONDARY_NAV),
 * поэтому навигация десктопа и мобилы больше не расходится. Ссылки бренд-aware
 * (withBrandPath) — под /u/:slug/* ведут на брендированные пути юриста.
 */
export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useUnreadMessages();
  const { isLawyer } = useLawyerProfile();
  const { user } = useAuth();
  const branding = useBranding();
  const [moreOpen, setMoreOpen] = useState(false);
  const [cabinetChooserOpen, setCabinetChooserOpen] = useState(false);

  // Полноэкранный чат-тред: десктоп-сайдбар оставляем, но мобильные верхнюю
  // панель и нижние табы прячем (у чата своя шапка с «назад», а h-screen-поле
  // ввода прижато к низу — табы бы его перекрыли).
  const chat = isChatThread(location.pathname);
  const chatViewportHeight = useVisualViewportHeight(chat);

  const resolve = (item: Pick<CabinetNavItem, "to" | "external">) =>
    item.external ? item.to : withBrandPath(location.pathname, item.to);

  const isItemActive = (item: CabinetNavItem) => {
    const target = resolve(item);
    // «Главная» активна только точным совпадением, иначе светилась бы на всех /dashboard/*
    if (item.to === "/dashboard") return location.pathname === target;
    return location.pathname === target || location.pathname.startsWith(target + "/");
  };

  const moreActive = SECONDARY_NAV.some(isItemActive);

  const go = (item: Pick<CabinetNavItem, "to" | "external">) => {
    setMoreOpen(false);
    navigate(resolve(item));
  };

  const handleLogout = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
    navigate("/");
  };

  const monogram = (() => {
    const parts = branding.displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "ЛК";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  // ── Нижние табы: 4 первичных + «Ещё». ИИ (индекс 2) — акцентный центр. ──
  const tabs = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], PRIMARY_NAV[3]];

  return (
    <div
      className={cn("flex bg-background", chat ? "min-h-0 overflow-hidden" : "min-h-screen")}
      style={chat && chatViewportHeight ? { height: chatViewportHeight } : undefined}
    >
      {/* ── Десктоп: левый сайдбар ─────────────────────────────────────── */}
      <aside className="hidden md:flex sticky top-0 h-screen w-60 flex-shrink-0 flex-col border-r border-ink/10 bg-paper-deep/30">
        <Link to={resolve({ to: "/dashboard" })} className="block border-b border-ink/10 px-5 py-5">
          <p className="section-number">Личный кабинет</p>
          <p className="mt-0.5 truncate font-serif text-lg text-foreground">{branding.displayName}</p>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {PRIMARY_NAV.map((item) => (
            <SidebarItem key={item.to} item={item} active={isItemActive(item)} unread={unreadCount} onClick={() => go(item)} />
          ))}
          <div className="my-3 border-t border-ink/10" />
          {SECONDARY_NAV.map((item) => (
            <SidebarItem key={item.to} item={item} active={isItemActive(item)} unread={unreadCount} onClick={() => go(item)} muted />
          ))}
        </nav>
        <div className="space-y-2 border-t border-ink/10 p-3">
          <LimitsBadge variant="row" className="px-1" />
          {user?.email && <p className="truncate px-1 text-xs text-muted-foreground">{user.email}</p>}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      </aside>

      <div className={cn("flex min-w-0 flex-1 flex-col", chat && "min-h-0 overflow-hidden")}>
        {/* ── Десктоп: верхняя панель — выход и возврат на сайт всегда на виду
               (раньше «Выйти» был только внизу сайдбара). ─────────────────── */}
        {!chat && (
        <header className="sticky top-0 z-40 hidden h-12 items-center justify-between gap-3 border-b border-ink/10 bg-paper/95 px-4 backdrop-blur md:flex">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Globe className="h-4 w-4" />
            На сайт
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <LimitsBadge variant="pill" />
            {isLawyer && (
              <button
                type="button"
                onClick={() => setCabinetChooserOpen(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Briefcase className="h-4 w-4" />
                Сменить кабинет
              </button>
            )}
            {user?.email && (
              <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground lg:inline">{user.email}</span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </header>
        )}

        {/* ── Мобайл: компактная верхняя панель кабинета (на чат-тредах нет) ── */}
        {!chat && (
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-ink/10 bg-paper px-3 md:hidden">
          <Link to={resolve({ to: "/dashboard" })} className="flex min-w-0 items-center gap-2" aria-label="Личный кабинет">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-ink/80 font-serif text-sm italic text-ink">
              {monogram}
            </span>
            <span className="truncate font-serif text-base text-ink">Личный кабинет</span>
          </Link>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <LimitsBadge variant="pill" />
            <button
              type="button"
              onClick={() => navigate(resolve({ to: "/client/messages" }))}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-foreground/80 hover:bg-muted"
              aria-label={unreadCount > 0 ? `Чат с юристом (${unreadCount})` : "Чат с юристом"}
            >
              <MessageSquare className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-seal px-1 text-[10px] font-bold leading-none text-paper">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>
        )}

        <div className={cn("flex-1", chat && "min-h-0 overflow-hidden")}>
          <Outlet />
        </div>

        {/* Зазор под фиксированные нижние табы (на чат-тредах табов нет). */}
        {!chat && <div className="h-[64px] md:hidden" aria-hidden />}
      </div>

      {/* ── Мобайл: нижние табы (скрыты на полноэкранных чат-тредах) ────── */}
      {!chat && (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background shadow-[0_-4px_20px_rgba(0,0,0,0.04)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Навигация кабинета"
      >
        <div className="flex h-[60px] items-stretch justify-around px-1">
          {tabs.map((item, i) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            const featured = i === 2; // ИИ-консультант — акцентный центр
            return (
              <button
                key={item.to}
                onClick={() => go(item)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className="relative flex min-h-[44px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-90"
              >
                {active && <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />}
                {featured ? (
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                      active ? "scale-110 bg-gradient-to-br from-primary to-accent shadow-md" : "bg-gradient-to-br from-primary/90 to-accent/90",
                    )}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                ) : (
                  <Icon className={cn("h-[22px] w-[22px] shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground")} strokeWidth={active ? 2.4 : 2} />
                )}
                <span className={cn("truncate text-[11px] font-medium leading-tight", active ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {item.label === "ИИ-консультант" ? "ИИ" : item.label}
                </span>
              </button>
            );
          })}

          {/* «Ещё» — вторичные разделы в нижнем листе */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Ещё"
            className="relative flex min-h-[44px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-90"
          >
            {moreActive && <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />}
            <span className="relative">
              <MoreHorizontal className={cn("h-[22px] w-[22px] shrink-0", moreActive ? "text-primary" : "text-muted-foreground")} strokeWidth={moreActive ? 2.4 : 2} />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-seal" />}
            </span>
            <span className={cn("truncate text-[11px] font-medium leading-tight", moreActive ? "font-semibold text-primary" : "text-muted-foreground")}>Ещё</span>
          </button>
        </div>
      </nav>
      )}

      {/* ── Лист «Ещё» (вторичные пункты + аккаунт) ────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-left">Ещё</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            <div className="px-3 py-2">
              <LimitsBadge variant="row" />
            </div>
            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item);
              return (
                <button
                  key={item.to}
                  onClick={() => go(item)}
                  className={cn(
                    "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base transition-colors",
                    active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/85 hover:bg-muted",
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.messagesBadge && unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-seal px-1.5 text-[11px] font-bold text-paper">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
            {isLawyer && (
              <button
                onClick={() => { setMoreOpen(false); setTimeout(() => setCabinetChooserOpen(true), 0); }}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-foreground/85 transition-colors hover:bg-muted"
              >
                <Briefcase className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1">Сменить кабинет</span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">Выйти</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setMoreOpen(false)} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Сквозная плавающая кнопка экстренного аудита (на чат-тредах прячем —
          перекрывала бы поле ввода). */}
      {!chat && <EmergencyAuditButton />}
      <CabinetChooserDialog open={cabinetChooserOpen} onOpenChange={setCabinetChooserOpen} />
    </div>
  );
}

/** Пункт сайдбара (десктоп). */
function SidebarItem({
  item,
  active,
  unread,
  onClick,
  muted,
}: {
  item: CabinetNavItem;
  active: boolean;
  unread: number;
  onClick: () => void;
  muted?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-gold/15 font-medium text-gold-deep"
          : muted
            ? "text-foreground/70 hover:bg-muted hover:text-foreground"
            : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.messagesBadge && unread > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-seal px-1.5 text-[11px] font-bold text-paper">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
