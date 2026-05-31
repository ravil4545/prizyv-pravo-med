import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Calendar, FileHeart, MessageSquare, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { withBrandPath } from "@/lib/brandPath";

interface CabinetNavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  /** Пункт ещё не реализован (Модуль 4 — календарь). Показываем как «Скоро». */
  soon?: boolean;
}

const NAV_ITEMS: CabinetNavItem[] = [
  { label: "Главная", to: "/dashboard", icon: Home },
  { label: "Мой календарь", to: "/dashboard/calendar", icon: Calendar },
  { label: "Мои документы", to: "/dashboard/medical-documents", icon: FileHeart },
  { label: "Чат с ИИ", to: "/dashboard/ai-chat", icon: MessageSquare },
  { label: "База знаний", to: "/dashboard/templates", icon: BookOpen },
  { label: "Профиль и подписка", to: "/profile", icon: User },
];

/**
 * Единое боковое меню личного кабинета (Модуль 1).
 *
 * Оборачивает клиентские страницы ЛК через <Outlet/>. На десктопе меню
 * фиксировано слева (sticky); на мобиле скрыто — там работает нижняя
 * навигация (MobileBottomNav). Ссылки бренд-aware: под /u/:slug/* ведут
 * на брендированные пути юриста (withBrandPath). Сами страницы не
 * меняются — обёртка лишь добавляет колонку меню рядом с контентом.
 */
export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolve = (target: string) => withBrandPath(location.pathname, target);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex sticky top-0 h-screen w-60 flex-shrink-0 flex-col border-r border-ink/10 bg-paper-deep/30">
        <div className="border-b border-ink/10 px-5 py-5">
          <p className="section-number">Личный кабинет</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            if (item.soon) {
              return (
                <div
                  key={item.label}
                  aria-disabled="true"
                  className="flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/60"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                    Скоро
                  </span>
                </div>
              );
            }

            const target = resolve(item.to);
            const active = location.pathname === target;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(target)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-gold/15 font-medium text-gold-deep"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
