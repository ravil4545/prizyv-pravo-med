import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAdminPath, isCabinetPath } from "@/lib/cabinetNav";
import { isLawyerPath } from "@/lib/lawyerNav";

const RagChat = lazy(() => import("./RagChat"));

const HIDDEN_ROUTES = [
  "/auth", "/login", "/register", "/reset-password",
  "/dashboard", "/lawyer/chat", "/client/chat", "/ai",
];

const PRELOAD_DELAY_MS = 8000;
const ASK_AI_LABEL = "\u0421\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0418\u0418";
const ASK_AI_ARIA_LABEL = `${ASK_AI_LABEL} - \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e`;
const LOADING_LABEL = "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430";

const isHiddenRoute = (pathname: string) =>
  HIDDEN_ROUTES.some((route) => pathname.startsWith(route)) ||
  isCabinetPath(pathname) ||
  isLawyerPath(pathname) ||
  isAdminPath(pathname);

const scheduleIdle = (callback: () => void) => {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(id);
};

function LauncherButton({
  loading,
  onClick,
}: {
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "fixed z-40 hidden items-center gap-2 rounded-full shadow-xl transition-shadow duration-200 md:flex",
        "bg-gradient-to-br from-primary to-accent text-white",
        "right-6 bottom-6 h-14 w-auto justify-center px-5 gap-2.5",
        loading ? "cursor-wait opacity-90" : "hover:shadow-2xl",
      )}
      aria-label={ASK_AI_ARIA_LABEL}
    >
      {loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <BookOpen className="h-5 w-5 shrink-0" />}
      <span className="hidden whitespace-nowrap text-sm font-semibold md:inline">
        {loading ? LOADING_LABEL : ASK_AI_LABEL}
      </span>
    </button>
  );
}

export default function DeferredRagChat() {
  const location = useLocation();
  const hidden = isHiddenRoute(location.pathname);
  const [loadChat, setLoadChat] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  useEffect(() => {
    if (hidden || loadChat) return;

    let cancelIdle: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      cancelIdle = scheduleIdle(() => {
        import("./RagChat").catch(() => {});
      });
    }, PRELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      cancelIdle?.();
    };
  }, [hidden, loadChat]);

  if (hidden) return null;

  if (loadChat) {
    return (
      <Suspense fallback={<LauncherButton loading />}>
        <RagChat initialOpen={openOnMount} />
      </Suspense>
    );
  }

  return (
    <LauncherButton
      onClick={() => {
        setOpenOnMount(true);
        setLoadChat(true);
      }}
    />
  );
}
