import { Check, Circle, Dot, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CasePath, PathStation } from "@/lib/casePath";

// ════════════════════════════════════════════════════════════════════════
//  Визуальная карта пути дела (§3 предложения по оптимизации).
//
//  Отвечает на вопрос, которого раньше не было нигде: «я на шаге N из 6,
//  следующее действие — вот это». Данные считает чистая функция buildCasePath
//  (src/lib/casePath.ts), здесь — только отрисовка.
//
//  Десктоп — горизонтальная лента станций, мобайл — вертикальный список.
// ════════════════════════════════════════════════════════════════════════

interface Props {
  path: CasePath;
  className?: string;
}

const StationIcon = ({ status }: { status: PathStation["status"] }) => {
  if (status === "done") return <Check className="h-3.5 w-3.5" />;
  if (status === "current") return <Dot className="h-5 w-5" />;
  return <Circle className="h-2.5 w-2.5" />;
};

const dotClass = (status: PathStation["status"]) =>
  cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
    status === "done" && "border-gold bg-gold text-ink",
    status === "current" && "border-gold bg-paper text-gold-deep animate-pulse",
    status === "todo" && "border-ink/20 bg-paper text-ink/30",
  );

const CasePathMap = ({ path, className }: Props) => {
  const current = path.stations.find((s) => s.status === "current");
  const doneCount = path.stations.filter((s) => s.status === "done").length;

  return (
    <section className={cn("border border-ink/15 bg-paper p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
        <h2 className="font-serif text-xl text-ink">Путь до военного билета</h2>
        <span className="font-mono text-xs text-ink/50 tabular-nums">
          {doneCount} из {path.stations.length} пройдено
        </span>
      </div>

      {path.daysLeft !== null && (
        <p
          className={cn(
            "mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide",
            path.daysLeft <= 14 ? "text-seal" : "text-ink/50",
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {path.daysLeft < 0
            ? `Дата мероприятий прошла ${Math.abs(path.daysLeft)} дн. назад`
            : path.daysLeft === 0
            ? "Мероприятия сегодня"
            : `До призывных мероприятий ${path.daysLeft} дн.`}
        </p>
      )}

      {/* ── Десктоп: горизонтальная лента ─────────────────────────────── */}
      <ol className="hidden sm:flex items-start gap-1 mt-4">
        {path.stations.map((s, i) => (
          <li key={s.key} className="flex-1 min-w-0">
            <div className="flex items-center">
              <div className={dotClass(s.status)}>
                <StationIcon status={s.status} />
              </div>
              {i < path.stations.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1 ml-1",
                    s.status === "done" ? "bg-gold" : "bg-ink/15",
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                "mt-2 text-xs font-semibold leading-tight",
                s.status === "todo" ? "text-ink/40" : "text-ink",
              )}
            >
              {s.label}
            </p>
            <p className="text-[11px] text-ink-soft leading-tight mt-0.5 break-words">{s.detail}</p>
          </li>
        ))}
      </ol>

      {/* ── Мобайл: вертикальный список ───────────────────────────────── */}
      <ol className="sm:hidden mt-4 space-y-0">
        {path.stations.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={dotClass(s.status)}>
                <StationIcon status={s.status} />
              </div>
              {i < path.stations.length - 1 && (
                <span className={cn("w-px flex-1 min-h-[24px]", s.status === "done" ? "bg-gold" : "bg-ink/15")} />
              )}
            </div>
            <div className="pb-4 min-w-0">
              <p className={cn("text-sm font-semibold leading-tight", s.status === "todo" ? "text-ink/40" : "text-ink")}>
                {s.label}
              </p>
              <p className="text-xs text-ink-soft mt-0.5">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Готовность ────────────────────────────────────────────────── */}
      <div className="mt-5 pt-5 border-t border-ink/10">
        <div className="flex items-baseline justify-between gap-4 mb-1.5">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
            Готовность дела
          </span>
          <span className="font-mono text-sm text-gold-deep tabular-nums">{path.readiness} / 10</span>
        </div>
        <div className="h-2 w-full bg-ink/10 overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${path.readiness * 10}%` }} />
        </div>
        {/* Та же оговорка, что и в разборе и в TermHint: это не прогноз. */}
        <p className="mt-2 text-[11px] text-ink/50 leading-relaxed">
          Оценка полноты документов, а не прогноз решения комиссии.
        </p>
      </div>

      {/* ── Следующий шаг ─────────────────────────────────────────────── */}
      {current?.hint && (
        <div className="mt-5 border-l-2 border-gold pl-4">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep mb-1">
            Следующий шаг · {current.label}
          </p>
          <p className="text-sm text-ink leading-relaxed">{current.hint}</p>
        </div>
      )}

      {path.currentIndex === -1 && (
        <div className="mt-5 border-l-2 border-gold pl-4">
          <p className="text-sm text-ink leading-relaxed">
            Все этапы пройдены. Если остались вопросы по документам — напишите юристу.
          </p>
        </div>
      )}
    </section>
  );
};

export default CasePathMap;
