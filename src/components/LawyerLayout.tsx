import { useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { MoreHorizontal, LogOut, MessageSquare, ChevronRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAWYER_PRIMARY_NAV, LAWYER_SECONDARY_NAV, type LawyerNavItem } from "@/lib/lawyerNav";
import { isChatThread } from "@/lib/cabinetNav";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
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
 * Обвязка кабинета юриста — зеркало DashboardLayout (клиент), та же модель
 * навигации из ОДНОГО конфига (lawyerNav). Header/Footer/MobileBottomNav на
 * маршрутах /lawyer/* не рендерятся (isLawyerPath) — хром даёт этот layout:
 *  - десктоп: левый сайдбар (первичные + вторичные + аккаунт);
 *  - мобайл:  верхняя панель + нижние табы (4 первичных + «Ещё»).
 */
export default function LawyerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useUnreadMessages();
  const { user } = useAuth();
  const branding = useBranding();
  const [moreOpen, setMoreOpen] = useState(false);

  // Полноэкранный чат-тред /lawyer/chat/* — десктоп-сайдбар оставляем, мобильные
  // верхнюю панель и нижние табы прячем (у чата своя шапка, поле ввода у низа).
  const chat = isChatThread(location.pathname);
  const chatViewportHeight = useVisualViewportHeight(chat);

  const isItemActive = (item: LawyerNavItem) => {
    // «Кабинет» активен только точным совпадением, иначе светился бы на всех /lawyer/*
    if (item.to === "/lawyer") return location.pathname === "/lawyer";
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  const moreActive = LAWYER_SECONDARY_NAV.some(isItemActive);

  const go = (item: Pick<LawyerNavItem, "to">) => {
    setMoreOpen(false);
    navigate(item.to);
  };

  const handleLogout = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
    navigate("/");
  };

  const tabs = [LAWYER_PRIMARY_NAV[0], LAWYER_PRIMARY_NAV[1], LAWYER_PRIMARY_NAV[2], LAWYER_PRIMARY_NAV[3]];

  return (
    <div
      className={cn("flex bg-background", chat ? "min-h-0 overflow-hidden" : "min-h-screen")}
      style={chat && chatViewportHeight ? { height: chatViewportHeight } : undefined}
    >
      {/* ── Десктоп: левый сайдбар ─────────────────────────────────────── */}
      <aside className="hidden md:flex sticky top-0 h-screen w-60 flex-shrink-0 flex-col border-r border-ink/10 bg-paper-deep/30">
        <Link to="/lawyer" className="block border-b border-ink/10 px-5 py-5">
          <p className="section-number">Кабинет юриста</p>
          <p className="mt-0.5 truncate font-serif text-lg text-foreground">{branding.displayName}</p>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {LAWYER_PRIMARY_NAV.map((item) => (
            <SidebarItem key={item.to} item={item} active={isItemActive(item)} unread={unreadCount} onClick={() => go(item)} />
          ))}
          <div className="my-3 border-t border-ink/10" />
          {LAWYER_SECONDARY_NAV.map((item) => (
            <SidebarItem key={item.to} item={item} active={isItemActive(item)} unread={unreadCount} onClick={() => go(item)} muted />
          ))}
        </nav>
        <div className="space-y-2 border-t border-ink/10 p-3">
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
        {/* ── Десктоп: верхняя панель — выход и возврат на сайт всегда на виду ── */}
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

        {/* ── Мобайл: верхняя панель кабинета (на чат-тредах нет) ────────── */}
        {!chat && (
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-ink/10 bg-paper px-3 md:hidden">
          <Link to="/lawyer" className="flex min-w-0 items-center gap-2" aria-label="Кабинет юриста">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-ink/80 font-serif text-sm italic text-ink">
              {monogram(branding.displayName)}
            </span>
            <span className="truncate font-serif text-base text-ink">Кабинет юриста</span>
          </Link>
          <button
            type="button"
            onClick={() => navigate("/lawyer/chats")}
            className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-foreground/80 hover:bg-muted"
            aria-label={unreadCount > 0 ? `Чаты (${unreadCount})` : "Чаты"}
          >
            <MessageSquare className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-seal px-1 text-[10px] font-bold leading-none text-paper">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </header>
        )}

        <div className={cn("flex-1", chat && "min-h-0 overflow-hidden")}>
          <Outlet />
        </div>

        {!chat && <div className="h-[64px] md:hidden" aria-hidden />}
      </div>

      {/* ── Мобайл: нижние табы (скрыты на полноэкранных чат-тредах) ────── */}
      {!chat && (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background shadow-[0_-4px_20px_rgba(0,0,0,0.04)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Навигация кабинета юриста"
      >
        <div className="flex h-[60px] items-stretch justify-around px-1">
          {tabs.map((item, i) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            const featured = i === 2; // Чаты — акцентный центр
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
                      "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                      active ? "scale-110 bg-gradient-to-br from-primary to-accent shadow-md" : "bg-gradient-to-br from-primary/90 to-accent/90",
                    )}
                  >
                    <Icon className="h-4 w-4 text-white" />
                    {item.messagesBadge && unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-seal px-1 text-[9px] font-bold leading-none text-paper">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                ) : (
                  <Icon className={cn("h-[22px] w-[22px] shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground")} strokeWidth={active ? 2.4 : 2} />
                )}
                <span className={cn("truncate text-[11px] font-medium leading-tight", active ? "font-semibold text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Ещё"
            className="relative flex min-h-[44px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-90"
          >
            {moreActive && <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />}
            <MoreHorizontal className={cn("h-[22px] w-[22px] shrink-0", moreActive ? "text-primary" : "text-muted-foreground")} strokeWidth={moreActive ? 2.4 : 2} />
            <span className={cn("truncate text-[11px] font-medium leading-tight", moreActive ? "font-semibold text-primary" : "text-muted-foreground")}>Ещё</span>
          </button>
        </div>
      </nav>
      )}

      {/* ── Лист «Ещё» ─────────────────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="text-left">Ещё</SheetTitle>
          </SheetHeader>
          <div className="p-2">
            {LAWYER_SECONDARY_NAV.map((item) => {
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
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
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
    </div>
  );
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Ю";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Пункт сайдбара (десктоп). */
function SidebarItem({
  item,
  active,
  unread,
  onClick,
  muted,
}: {
  item: LawyerNavItem;
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
