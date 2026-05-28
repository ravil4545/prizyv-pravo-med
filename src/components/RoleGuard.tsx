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
 * Кабинет клиента и кабинет юриста — РАЗНЫЕ сущности, но один человек может
 * пользоваться обоими (юрист тоже обычный пользователь сайта).
 *
 * Поэтому:
 *   • /dashboard/* (role="client") — доступен любому залогиненному, включая
 *     юриста. Вход — через шапку сайта.
 *   • /lawyer/*    (role="lawyer") — только активному юристу. Вход — через
 *     подвал сайта. Не-юриста отправляем в обычный кабинет.
 *
 * Раньше клиента-юриста насильно перекидывало с /dashboard на /lawyer — это
 * мешало юристу пользоваться обычным кабинетом. Убрано.
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

    // Кабинет юриста — только для активных юристов. Остальных в обычный кабинет.
    if (role === "lawyer" && !isLawyer) {
      navigate("/dashboard", { replace: true });
      return;
    }
    // role === "client": пускаем всех залогиненных (в т.ч. юристов) — кабинеты
    // независимы, насильно никого не перекидываем.
  }, [loading, user, isLawyer, role, location.pathname, location.search, navigate, authRedirect]);

  // Skeleton пока решаем куда отправить
  const shouldShowSkeleton =
    loading ||
    !user ||
    (role === "lawyer" && !isLawyer);

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
