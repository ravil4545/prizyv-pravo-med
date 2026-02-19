import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEMO_KEY = "nepriziv_demo_usage";
const DEMO_ID_KEY = "nepriziv_demo_id";

interface DemoUsage {
  document_uploads_used: number;
  ai_questions_used: number;
  first_visit: string;
}

const DEFAULT_USAGE: DemoUsage = {
  document_uploads_used: 0,
  ai_questions_used: 0,
  first_visit: new Date().toISOString(),
};

function getDemoId(): string {
  let id = localStorage.getItem(DEMO_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEMO_ID_KEY, id);
  }
  return id;
}

function getUsage(): DemoUsage {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULT_USAGE };
}

function saveUsage(usage: DemoUsage) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(usage));
}

export function useDemoMode() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [usage, setUsage] = useState<DemoUsage>(getUsage);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        // Anonymous users have is_anonymous = true in user metadata
        setIsAnonymous(session.user.is_anonymous === true);
      } else {
        setIsAuthenticated(false);
        setIsAnonymous(false);
      }
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setIsAnonymous(session?.user?.is_anonymous === true || false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isDemoMode = isAuthenticated === false || isAnonymous;

  const demoDocLimit = 1;
  const demoAiLimit = 1;

  const canUploadDocument = useCallback((): boolean => {
    if (!isDemoMode) return true; // registered users use useSubscription
    return usage.document_uploads_used < demoDocLimit;
  }, [isDemoMode, usage]);

  const canAskAI = useCallback((): boolean => {
    if (!isDemoMode) return true;
    return usage.ai_questions_used < demoAiLimit;
  }, [isDemoMode, usage]);

  const incrementDemoDocUploads = useCallback(() => {
    const updated = { ...usage, document_uploads_used: usage.document_uploads_used + 1 };
    setUsage(updated);
    saveUsage(updated);
    trackDemoUsage(updated);
  }, [usage]);

  const incrementDemoAIQuestions = useCallback(() => {
    const updated = { ...usage, ai_questions_used: usage.ai_questions_used + 1 };
    setUsage(updated);
    saveUsage(updated);
    trackDemoUsage(updated);
  }, [usage]);

  const trackDemoUsage = async (currentUsage: DemoUsage) => {
    try {
      const demoId = getDemoId();
      await supabase.from("demo_visitors").upsert({
        anonymous_user_id: demoId,
        document_uploads_used: currentUsage.document_uploads_used,
        ai_questions_used: currentUsage.ai_questions_used,
        last_visit_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        browser: getBrowser(),
        os: getOS(),
        device_type: getDeviceType(),
      }, { onConflict: "anonymous_user_id" });
    } catch (e) {
      console.error("Demo tracking error:", e);
    }
  };

  // Track initial visit
  useEffect(() => {
    if (isDemoMode && isAuthenticated !== null) {
      const demoId = getDemoId();
      supabase.from("demo_visitors").upsert({
        anonymous_user_id: demoId,
        document_uploads_used: usage.document_uploads_used,
        ai_questions_used: usage.ai_questions_used,
        last_visit_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        browser: getBrowser(),
        os: getOS(),
        device_type: getDeviceType(),
      }, { onConflict: "anonymous_user_id" }).then(() => {});
    }
  }, [isDemoMode, isAuthenticated]);

  const remainingDemoDocs = Math.max(0, demoDocLimit - usage.document_uploads_used);
  const remainingDemoAI = Math.max(0, demoAiLimit - usage.ai_questions_used);

  return {
    isDemoMode,
    isAuthenticated,
    isAnonymous,
    canUploadDocument,
    canAskAI,
    incrementDemoDocUploads,
    incrementDemoAIQuestions,
    remainingDemoDocs,
    remainingDemoAI,
    demoDocLimit,
    demoAiLimit,
  };
}

function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Other";
}

function getOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Other";
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}
