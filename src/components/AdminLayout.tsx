import { Outlet, Link, NavLink, useNavigate } from "react-router-dom";
import {
  Globe, LogOut, LayoutDashboard, Users, BarChart3, FileText, Star,
  MessagesSquare, BookOpen, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

// Единый хром админки: шапка с выходом + горизонтальная навигация по всем
// разделам. Сайтовые Header/Footer на /admin/* подавлены (isAdminPath) —
// раньше админ-страницы были разрозненными, переход между ними шёл через
// главную кабинета.
const ADMIN_NAV = [
  { to: "/admin", label: "Обзор", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Пользователи", icon: Users },
  { to: "/admin/analytics", label: "Аналитика", icon: BarChart3 },
  { to: "/admin/blog", label: "Блог", icon: FileText },
  { to: "/admin/testimonials", label: "Отзывы", icon: Star },
  { to: "/admin/forum", label: "Форум", icon: MessagesSquare },
  { to: "/admin/articles", label: "Статьи РБ", icon: BookOpen },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="cabinet-shell cabinet-bg min-h-screen ym-hide-content">
      <header className="sticky top-0 z-40 border-b border-border bg-paper">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <Link to="/admin" className="flex min-w-0 items-center gap-2 font-serif text-base text-ink">
            <span className="rounded bg-seal px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-paper">
              Admin
            </span>
            <span className="truncate">nepriziv.ru</span>
          </Link>
          <div className="flex flex-shrink-0 items-center gap-1">
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">На сайт</span>
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Кабинет</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide px-2 pb-2" aria-label="Разделы админки">
          {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-seal/10 font-medium text-seal"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
