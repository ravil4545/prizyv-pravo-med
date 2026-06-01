import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeValidity, type ValidityLevel } from "@/lib/documentValidity";

interface DocumentValidityBadgeProps {
  documentDate?: string | null;
  uploadedAt?: string | null;
  title?: string | null;
  typeName?: string | null;
  className?: string;
}

const STYLES: Record<Exclude<ValidityLevel, "none">, string> = {
  fresh: "border-emerald-600/20 bg-emerald-50/60 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-300",
  soon: "border-amber-500/30 bg-amber-50/70 text-amber-700 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-300",
  expired: "border-rose-500/30 bg-rose-50/70 text-rose-700 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-300",
};

/**
 * Бейдж «срок годности» документа (Модуль 2 — удержание).
 *
 * Показывает динамический статус актуальности справки: свежая / скоро обновить /
 * истёк. Для бессрочных документов и документов без даты — не рендерится
 * (возвращает null), чтобы не зашумлять интерфейс.
 */
export default function DocumentValidityBadge({
  documentDate,
  uploadedAt,
  title,
  typeName,
  className,
}: DocumentValidityBadgeProps) {
  const v = computeValidity({ documentDate, uploadedAt, title, typeName });
  if (v.level === "none") return null;

  const Icon = v.level === "fresh" ? CheckCircle2 : v.level === "soon" ? Clock : AlertTriangle;

  return (
    <span
      role="note"
      title={
        v.validForDays
          ? `Типовой срок актуальности — ${v.validForDays} дн. от даты документа. Ориентир, не гарантия.`
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-snug",
        STYLES[v.level],
        className,
      )}
    >
      <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      {v.label}
    </span>
  );
}
