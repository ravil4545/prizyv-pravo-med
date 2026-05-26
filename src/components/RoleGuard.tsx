import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import Header from "@/components/Header";
import { Skeleton } from "@/components/ui/skeleton";

interface RoleGuardProps {
  /** Какая роль ОЖИДАЕТСЯ для доступа к этому роуту */
  role: "client" | "lawyer";
  children: ReactNode;
  /** Куда отправить незалогиненного пользователя; по умолчанию /auth?next=<current> */
  authRedirect?: string;
}

/**
 * Разделяет кабинеты: на /dashboard/* пускаем только клиентов, на /lawyer/*
 * только юристов. Если зашёл «не та» роль — мягко переводим в её родной
 * кабинет, чтобы интерфейс не путал.
 *
 * Пока подгружаются auth/lawyer-профиль — рендерим заглушку, чтобы не было
 * вспышки контента «чужой» роли.
 */
const RoleGuard = ({ role, children, authRedirect }: RoleGuardProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();

  const loading = authLoading || (user && profileLoading);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(authRedirect || `/auth?next=${next}`, { replace: true });
      return;
    }

    if (role === "lawyer" && !isLawyer) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (role === "client" && isLawyer) {
      navigate("/lawyer", { replace: true });
      return;
    }
  }, [loading, user, isLawyer, role, location.pathname, location.search, navigate, authRedirect]);

  // Skeleton пока решаем куда отправить
  const shouldShowSkeleton =
    loading ||
    !user ||
    (role === "lawyer" && !isLawyer) ||
    (role === "client" && isLawyer);

  if (shouldShowSkeleton) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </main>
      </div>
    );
  }

  return <>{children}</>;
};

export default RoleGuard;
