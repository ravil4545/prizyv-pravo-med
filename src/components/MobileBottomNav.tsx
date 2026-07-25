import { useLocation, useNavigate } from "react-router-dom";
import { FileHeart, BookOpen, MessageSquare, Home, User, Users, FileText, BarChart3 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { cn } from "@/lib/utils";
import { isCabinetPath, isChatThread, isAdminPath } from "@/lib/cabinetNav";
import { isLawyerPath } from "@/lib/lawyerNav";

const MobileBottomNav = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { isLawyer } = useLawyerProfile();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isMobile) return null;

  const hiddenRoutes = ["/auth", "/login", "/register", "/reset-password"];
  if (hiddenRoutes.includes(location.pathname)) return null;

  // Публичный AI-чат использует нижнюю область под собственный composer.
  // Фиксированная навигация перекрывала поле ввода и кнопку отправки.
  if (location.pathname === "/ai") return null;

  // В кабинетах (клиент/юрист) нижнюю навигацию даёт соответствующий Layout
  // (единый конфиг с сайдбаром). Здесь не дублируем — иначе было бы два бара.
  // На полноэкранных чат-тредах баров нет вовсе (поле ввода прижато к низу).
  if (
    isCabinetPath(location.pathname) ||
    isLawyerPath(location.pathname) ||
    isAdminPath(location.pathname) ||
    isChatThread(location.pathname)
  )
    return null;

  // Юристам — навигация по их кабинету. Важно: /lawyers — это публичный
  // каталог юристов для клиентов, а не рабочая зона /lawyer.
  const isLawyerArea = location.pathname === "/lawyer" || location.pathname.startsWith("/lawyer/");
  const showLawyerNav = isLawyer || isLawyerArea;

  const navItems = showLawyerNav
    ? [
        { label: "Клиенты",   icon: Users,        path: "/lawyer/clients" },
        { label: "Чаты",      icon: MessageSquare, path: "/lawyer/chats", featured: true },
        { label: "Шаблоны",   icon: FileText,     path: "/lawyer/templates" },
        { label: "Аналитика", icon: BarChart3,    path: "/lawyer/analytics" },
        { label: "Кабинет",   icon: User,         path: "/lawyer" },
      ]
    : isAuthenticated
    ? [
        { label: "Главная",   icon: Home,          path: "/" },
        { label: "Документы", icon: FileHeart,     path: "/dashboard/medical-documents" },
        { label: "ИИ чат",    icon: MessageSquare, path: "/dashboard/ai-chat", featured: true },
        { label: "Диагнозы",  icon: BookOpen,      path: "/diagnoses" },
        { label: "Кабинет",   icon: User,          path: "/dashboard" },
      ]
    : // Аноним: только публичные маршруты. Раньше «Документы» вели в
      // /dashboard/medical-documents, а «Диагнозы» — в /medical-history; оба
      // под RoleGuard, поэтому таб из нижней панели молча выкидывал на /auth.
      // Публичного каталога /diagnoses в панели не было вообще.
      [
        { label: "Главная",  icon: Home,          path: "/" },
        { label: "Диагнозы", icon: BookOpen,      path: "/diagnoses" },
        { label: "ИИ чат",   icon: MessageSquare, path: "/ai", featured: true },
        { label: "Услуги",   icon: FileText,      path: "/services" },
        { label: "Войти",    icon: User,          path: "/auth" },
      ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <>
      {/* Spacer to prevent content overlap */}
      <div className="h-[68px] md:hidden" aria-hidden />

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/60 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch justify-around h-[60px] px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 gap-0.5 min-w-0 relative",
                  "transition-all duration-150 active:scale-90 touch-manipulation",
                  "min-h-[44px]"
                )}
                aria-label={item.label}
              >
                {/* Active indicator pill */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
                )}

                {item.featured ? (
                  <div className={cn(
                    "flex items-center justify-center h-9 w-9 rounded-xl transition-all",
                    active
                      ? "bg-gradient-to-br from-primary to-accent shadow-md scale-110"
                      : "bg-gradient-to-br from-primary/90 to-accent/90"
                  )}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                ) : (
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px] shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                    strokeWidth={active ? 2.4 : 2}
                  />
                )}

                <span
                  className={cn(
                    "text-[10.5px] font-medium truncate leading-tight transition-colors",
                    active ? "text-primary font-semibold" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default MobileBottomNav;
