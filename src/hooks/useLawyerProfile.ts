import { useEffect, useState } from "react";
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
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    // Сбрасываем профиль предыдущего аккаунта: иначе после смены пользователя
    // (logout → login другим) isLawyer оставался от старого аккаунта и
    // RoleGuard мог увести нового клиента в /lawyer.
    if (!user) { setProfile(null); setLoading(false); return; }

    let cancelled = false;
    supabase
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data as unknown as LawyerProfile | null);
        setLoading(false);
      }, () => {
        // Ошибка запроса (например, сбой сети) не должна оставлять кабинет
        // навсегда на скелетоне — снимаем loading, профиль остаётся прежним/пустым.
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  // Роль юриста активна, только если запись существует И is_active = true.
  // Раньше было `!!profile` — из-за этого «снять с роли юриста» в админке
  // (она ставит is_active=false) фактически не убирала роль: юрист всё равно
  // редиректился в /lawyer. Теперь деактивация работает как ожидается,
  // а бренд-данные (slug, фото, тариф) сохраняются и роль можно вернуть.
  const isLawyer = !!profile && profile.is_active === true;
  const isPro = profile?.subscription_tier === "pro";

  return { profile, loading, isLawyer, isPro };
};
