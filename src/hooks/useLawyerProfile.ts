import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface LawyerProfile {
  id?: string;
  user_id: string;
  full_name: string | null;
  specialization: string | null;
  license_number: string | null;
  bio: string | null;
  photo_url: string | null;
  is_active: boolean;
  subscription_tier: "basic" | "pro";
  subscription_until: string | null;
  clients_limit: number;
  created_at: string;
}

export const useLawyerProfile = () => {
  const { user, loading: authLoading } = useAuth();

  // React Query шарит результат между ВСЕМИ вызовами хука по одному ключу
  // ["lawyer_profile", user.id]. Раньше каждый компонент (Layout, Dashboard,
  // Analytics, бейджи…) фетчил lawyer_profiles независимо — на загрузку
  // страницы летело 3–6 одинаковых запросов. Ключ включает user.id, поэтому
  // после смены аккаунта профиль не «залипает» от прежнего пользователя.
  const { data, isPending, isFetching } = useQuery({
    queryKey: ["lawyer_profile", user?.id],
    enabled: !authLoading && !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("lawyer_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as unknown as LawyerProfile | null) ?? null;
    },
  });

  const profile = user ? (data ?? null) : null;
  // loading истинно, только пока реально идёт первичная загрузка профиля юриста
  // (фоновый refetch по истечении staleTime не дёргает скелетоны/RoleGuard).
  const loading = authLoading || (!!user && isPending && isFetching);

  // Роль юриста активна, только если запись существует И is_active = true.
  // Раньше было `!!profile` — из-за этого «снять с роли юриста» в админке
  // (она ставит is_active=false) фактически не убирала роль: юрист всё равно
  // редиректился в /lawyer. Теперь деактивация работает как ожидается,
  // а бренд-данные (slug, фото, тариф) сохраняются и роль можно вернуть.
  const isLawyer = !!profile && profile.is_active === true;
  const isPro = profile?.subscription_tier === "pro";

  return { profile, loading, isLawyer, isPro };
};
