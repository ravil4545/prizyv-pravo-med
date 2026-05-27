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
    if (!user) { setLoading(false); return; }

    supabase
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as unknown as LawyerProfile | null);
        setLoading(false);
      });
  }, [user?.id, authLoading]);

  const isLawyer = !!profile;
  const isPro = profile?.subscription_tier === "pro";

  return { profile, loading, isLawyer, isPro };
};
