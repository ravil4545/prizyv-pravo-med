import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CaseProgress {
  /** Profile filled (full name) */
  profileFilled: boolean;
  /** Has at least one uploaded medical document */
  hasDocuments: boolean;
  /** At least one document has been analysed by AI */
  hasAiAnalysis: boolean;
  /** Active document-access grant to any lawyer */
  hasLawyerLink: boolean;
  /** Active paid subscription */
  hasActiveSubscription: boolean;
  /** Loading state */
  loading: boolean;
}

const EMPTY: CaseProgress = {
  profileFilled: false,
  hasDocuments: false,
  hasAiAnalysis: false,
  hasLawyerLink: false,
  hasActiveSubscription: false,
  loading: true,
};

export function useCaseProgress(): CaseProgress {
  const [progress, setProgress] = useState<CaseProgress>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || session.user.is_anonymous) {
          if (!cancelled) setProgress({ ...EMPTY, loading: false });
          return;
        }
        const userId = session.user.id;

        const [
          profileRes,
          docsRes,
          analyzedRes,
          accessRes,
          subRes,
        ] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
          supabase
            .from("medical_documents_v2")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("medical_documents_v2")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .not("ai_fitness_category", "is", null),
          supabase
            .from("client_document_access")
            .select("id", { count: "exact", head: true })
            .eq("client_user_id", userId)
            .eq("is_active", true),
          supabase.from("user_subscriptions").select("*").eq("user_id", userId).maybeSingle(),
        ]);

        const sub = subRes.data as { is_paid?: boolean; admin_override?: boolean; paid_until?: string | null } | null;
        const isActiveSub =
          !!sub &&
          (sub.admin_override === true ||
            (sub.is_paid === true && !!sub.paid_until && new Date(sub.paid_until) > new Date()));

        if (cancelled) return;
        setProgress({
          profileFilled: !!profileRes.data?.full_name,
          hasDocuments: (docsRes.count ?? 0) > 0,
          hasAiAnalysis: (analyzedRes.count ?? 0) > 0,
          hasLawyerLink: (accessRes.count ?? 0) > 0,
          hasActiveSubscription: isActiveSub,
          loading: false,
        });
      } catch (err) {
        console.error("useCaseProgress error", err);
        if (!cancelled) setProgress({ ...EMPTY, loading: false });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return progress;
}
