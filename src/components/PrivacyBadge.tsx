import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrivacyBadgeProps {
  /** "full" — замок + полное пояснение; "compact" — только короткая строка. */
  variant?: "full" | "compact";
  className?: string;
  /** Что именно защищается — подставляется в текст ("персональные и медицинские" по умолчанию). */
  subject?: string;
}

/**
 * Сквозной маркер защиты персональных данных по 152-ФЗ.
 *
 * Ставится в зонах загрузки паспорта и медицинских документов, чтобы
 * снизить тревожность пользователя при передаче чувствительных данных.
 * Цвет — emerald (доверие/безопасность), уже используется в проекте
 * (статусы «загружено», блок подтверждения оплаты).
 */
export default function PrivacyBadge({ variant = "full", className, subject }: PrivacyBadgeProps) {
  const text =
    variant === "compact"
      ? "Данные зашифрованы · 152-ФЗ"
      : `Ваши ${subject ?? "персональные и медицинские"} данные зашифрованы и защищены согласно 152-ФЗ`;

  return (
    <div
      role="note"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        "border-emerald-600/20 bg-emerald-50/60 text-emerald-800",
        "dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-300",
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium leading-snug">{text}</span>
    </div>
  );
}
