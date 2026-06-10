import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionData {
  is_paid: boolean;
  paid_until: string | null;
  admin_override: boolean;
  document_uploads_used: number;
  ai_questions_used: number;
  free_document_limit: number;
  free_ai_limit: number;
  trial_ends_at: string | null;
}

const DEFAULT_SUBSCRIPTION: SubscriptionData = {
  is_paid: false,
  paid_until: null,
  admin_override: false,
  document_uploads_used: 0,
  ai_questions_used: 0,
  free_document_limit: 3,
  free_ai_limit: 3,
  trial_ends_at: null,
};

// Квота пробного периода (3 дня с регистрации, дефолт trial_ends_at в БД):
// в течение триала действует расширенный лимит вместо безлимита.
export const TRIAL_DOC_LIMIT = 9;
export const TRIAL_AI_LIMIT = 9;

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching subscription:", error);
      setLoading(false);
      return;
    }

    if (!data) {
      // Auto-create subscription record
      const { data: newSub, error: insertError } = await supabase
        .from("user_subscriptions")
        .insert({ user_id: session.user.id })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating subscription:", insertError);
        setSubscription(DEFAULT_SUBSCRIPTION);
      } else {
        setSubscription(newSub as unknown as SubscriptionData);
      }
    } else {
      setSubscription(data as unknown as SubscriptionData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Активен ли 3-дневный пробный период (с момента регистрации).
  const isTrialActive = useCallback((): boolean => {
    if (!subscription?.trial_ends_at) return false;
    return new Date(subscription.trial_ends_at) > new Date();
  }, [subscription]);

  // Оплаченный доступ (или админ-переключатель) — настоящий безлимит.
  const isPaidActive = useCallback((): boolean => {
    if (!subscription) return false;
    if (subscription.admin_override) return true;
    if (!subscription.is_paid || !subscription.paid_until) return false;
    return new Date(subscription.paid_until) > new Date();
  }, [subscription]);

  // «Есть доступ к функциям кабинета» — подписка ИЛИ пробный период.
  // Квоты считаются отдельно: в триале лимит TRIAL_*, безлимит только у платных.
  const isActive = useCallback((): boolean => {
    if (isPaidActive()) return true;
    return isTrialActive();
  }, [isPaidActive, isTrialActive]);

  const canUploadDocument = useCallback((): boolean => {
    if (!subscription) return false;
    if (isPaidActive()) return true;
    if (isTrialActive()) return subscription.document_uploads_used < TRIAL_DOC_LIMIT;
    return subscription.document_uploads_used < subscription.free_document_limit;
  }, [subscription, isPaidActive, isTrialActive]);

  const canAskAI = useCallback((): boolean => {
    if (!subscription) return false;
    if (isPaidActive()) return true;
    if (isTrialActive()) return subscription.ai_questions_used < TRIAL_AI_LIMIT;
    return subscription.ai_questions_used < subscription.free_ai_limit;
  }, [subscription, isPaidActive, isTrialActive]);

  const incrementDocumentUploads = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !subscription) return;

    const newCount = subscription.document_uploads_used + 1;
    await supabase
      .from("user_subscriptions")
      .update({ document_uploads_used: newCount })
      .eq("user_id", session.user.id);

    setSubscription(prev => prev ? { ...prev, document_uploads_used: newCount } : prev);
  }, [subscription]);

  const incrementAIQuestions = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !subscription) return;

    const newCount = subscription.ai_questions_used + 1;
    await supabase
      .from("user_subscriptions")
      .update({ ai_questions_used: newCount })
      .eq("user_id", session.user.id);

    setSubscription(prev => prev ? { ...prev, ai_questions_used: newCount } : prev);
  }, [subscription]);

  // Действующие лимиты: в триале — TRIAL_* (9/9), после — бесплатные (3/3).
  const trialNow = isTrialActive();
  const currentDocLimit = trialNow ? TRIAL_DOC_LIMIT : subscription?.free_document_limit ?? 3;
  const currentAiLimit = trialNow ? TRIAL_AI_LIMIT : subscription?.free_ai_limit ?? 3;

  const remainingDocUploads = subscription
    ? Math.max(0, currentDocLimit - subscription.document_uploads_used)
    : 0;

  const remainingAIQuestions = subscription
    ? Math.max(0, currentAiLimit - subscription.ai_questions_used)
    : 0;

  return {
    subscription,
    loading,
    isActive,
    isPaidActive,
    isTrialActive,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    canUploadDocument,
    canAskAI,
    incrementDocumentUploads,
    incrementAIQuestions,
    remainingDocUploads,
    remainingAIQuestions,
    currentDocLimit,
    currentAiLimit,
    refresh: fetchSubscription,
  };
}
