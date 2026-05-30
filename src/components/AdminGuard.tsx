import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Серверной защитой админки остаётся RLS таблиц (user_roles + has_role).
 * Этот guard — единый клиентский рубеж на уровне роутера: не даёт смонтировать
 * админ-страницу не-админу и страхует будущие админ-страницы, которые могли бы
 * забыть собственную проверку роли (раньше она дублировалась в каждой странице).
 */
const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ok">("checking");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth?next=/admin", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
      if (isAdmin) {
        setStatus("ok");
      } else {
        navigate("/", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  if (status !== "ok") {
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

export default AdminGuard;
