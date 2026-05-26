import { useDemoMode } from "@/hooks/useDemoMode";
import { useSubscription } from "@/hooks/useSubscription";
import { Bot, FileText, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LimitsBadgeProps {
  /** Variant: "pill" for header, "row" for menus */
  variant?: "pill" | "row";
  className?: string;
}

/**
 * Tiny indicator showing remaining free quota.
 *
 * - Anonymous (1 + 1):       "Демо · ИИ 1 · Файлы 1"
 * - Registered free (3 + 3): "Бесплатно · ИИ 3 · Файлы 3"
 * - Paid:                    "Подписка активна" (or null if hide)
 */
const LimitsBadge = ({ variant = "pill", className }: LimitsBadgeProps) => {
  const demo = useDemoMode();
  const sub = useSubscription();
  const isPaid = sub.isActive();

  if (sub.loading && !demo.isDemoMode) return null;

  // Paid subscription — show subtle crown
  if (isPaid) {
    if (variant === "row") {
      return (
        <div
          className={cn(
            "flex items-center gap-2 text-sm font-medium text-gold",
            className,
          )}
        >
          <Crown className="h-4 w-4" />
          Подписка активна
        </div>
      );
    }
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] uppercase border border-gold/40 text-gold-deep bg-gold/5",
          className,
        )}
      >
        <Crown className="h-3 w-3" />
        Безлимит
      </div>
    );
  }

  // Determine source of limits
  const isDemo = demo.isDemoMode;
  const ai = isDemo ? demo.remainingDemoAI : sub.remainingAIQuestions;
  const docs = isDemo ? demo.remainingDemoDocs : sub.remainingDocUploads;
  const aiTotal = isDemo ? demo.demoAiLimit : sub.subscription?.free_ai_limit ?? 0;
  const docsTotal = isDemo ? demo.demoDocLimit : sub.subscription?.free_document_limit ?? 0;
  const tierLabel = isDemo ? "Демо" : "Бесплатно";

  if (aiTotal === 0 && docsTotal === 0) return null;

  const min = Math.min(ai, docs);
  const exhausted = min === 0;
  const low = !exhausted && min <= 1;

  if (variant === "row") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.2em] uppercase",
            exhausted ? "text-seal" : low ? "text-gold-deep" : "text-ink/60",
          )}
        >
          {tierLabel}
        </span>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <Bot className="h-3.5 w-3.5 text-gold" />
            <span className="font-mono">
              {ai}<span className="text-ink/40">/{aiTotal}</span>
            </span>
          </span>
          <span className="text-ink/20">·</span>
          <span className="inline-flex items-center gap-1.5 text-ink">
            <FileText className="h-3.5 w-3.5 text-gold" />
            <span className="font-mono">
              {docs}<span className="text-ink/40">/{docsTotal}</span>
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 border font-mono text-[10px] tracking-[0.15em] uppercase",
        exhausted
          ? "border-seal/50 bg-seal/5 text-seal"
          : low
            ? "border-gold/60 bg-gold/10 text-gold-deep"
            : "border-ink/15 bg-paper-deep/40 text-ink/70",
        className,
      )}
      aria-label={`${tierLabel}: осталось ИИ ${ai} из ${aiTotal}, документов ${docs} из ${docsTotal}`}
    >
      <span className="hidden lg:inline">{tierLabel} · </span>
      <span className="inline-flex items-center gap-1">
        <Bot className="h-3 w-3" />
        {ai}
      </span>
      <span className="text-current/40">·</span>
      <span className="inline-flex items-center gap-1">
        <FileText className="h-3 w-3" />
        {docs}
      </span>
    </div>
  );
};

export default LimitsBadge;
