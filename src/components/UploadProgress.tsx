import { Loader2, Check } from "lucide-react";

interface UploadProgressProps {
  /** Current status text (e.g. "Обработка файла 2 из 5...") */
  status: string;
  /** Whether the AI analysis stage is active (vs upload/OCR) */
  stage?: "uploading" | "ocr" | "analyzing" | "linking";
}

const STAGES = [
  { id: "uploading", label: "Загрузка", short: "1" },
  { id: "ocr", label: "Распознавание", short: "2" },
  { id: "analyzing", label: "ИИ-анализ", short: "3" },
  { id: "linking", label: "Привязка к статье", short: "4" },
] as const;

/**
 * Editorial-style upload/analysis progress with 4 stages.
 *
 * Pass `stage` to highlight the current step. Without it, falls back to a
 * single animated spinner (used during indeterminate phases).
 */
const UploadProgress = ({ status, stage }: UploadProgressProps) => {
  const activeIndex = stage ? STAGES.findIndex((s) => s.id === stage) : -1;

  return (
    <div className="border border-ink/10 bg-paper-deep/40 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-5">
        <Loader2 className="h-5 w-5 text-gold animate-spin" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
            Обработка документа
          </p>
          <p className="font-serif text-base text-ink truncate">
            {status || "Подождите…"}
          </p>
        </div>
      </div>

      {/* Stages */}
      <ol className="grid grid-cols-4 gap-2 sm:gap-3">
        {STAGES.map((s, i) => {
          const isDone = activeIndex >= 0 && i < activeIndex;
          const isActive = activeIndex >= 0 && i === activeIndex;
          const isPending = activeIndex < 0 || i > activeIndex;
          return (
            <li key={s.id} className="flex flex-col items-center text-center">
              <div
                className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center border-2 font-mono text-xs sm:text-sm font-semibold transition-colors ${
                  isDone
                    ? "bg-ink text-paper border-ink"
                    : isActive
                      ? "bg-gold text-ink border-gold animate-pulse"
                      : "bg-paper text-ink/40 border-ink/15"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : s.short}
              </div>
              <span
                className={`mt-2 text-[10px] sm:text-xs leading-tight ${
                  isActive
                    ? "text-gold-deep font-semibold"
                    : isDone
                      ? "text-ink/80"
                      : "text-ink/40"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-ink/50 text-center mt-5 font-mono tracking-wider">
        Не закрывайте страницу — анализ занимает 10–30 секунд
      </p>
    </div>
  );
};

export default UploadProgress;
