import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ExitIntentDialog = lazy(() => import("./ExitIntentDialog"));

const BLOCKED_PATHS = [
  "/auth",
  "/login",
  "/register",
  "/reset-password",
  "/dashboard",
  "/lawyer",
  "/admin",
  "/client",
  "/profile",
  "/pay",
];

const LOAD_DELAY_MS = 10000;

const isBlockedPath = (pathname: string): boolean =>
  BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));

const scheduleIdle = (callback: () => void) => {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(id);
};

export default function DeferredExitIntentDialog() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const blocked = isBlockedPath(location.pathname);
  const [loadDialog, setLoadDialog] = useState(false);

  useEffect(() => {
    if (loading || user || blocked || loadDialog) return;

    let cancelIdle: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      cancelIdle = scheduleIdle(() => setLoadDialog(true));
    }, LOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      cancelIdle?.();
    };
  }, [blocked, loadDialog, loading, user]);

  if (loading || user || blocked || !loadDialog) return null;

  return (
    <Suspense fallback={null}>
      <ExitIntentDialog />
    </Suspense>
  );
}
