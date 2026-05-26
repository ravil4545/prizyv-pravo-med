import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Loader2, Phone } from "lucide-react";
import { useCaseProgress } from "@/hooks/useCaseProgress";
import { cn } from "@/lib/utils";

interface Stage {
  no: string;
  key: keyof Omit<ReturnType<typeof useCaseProgress>, "loading">;
  title: string;
  hint: string;
  ctaLabel: string;
  ctaPath: string;
}

const STAGES: Stage[] = [
  {
    no: "01",
    key: "profileFilled",
    title: "Профиль",
    hint: "Заполните данные — имя, год рождения, военкомат. Это база для всех документов.",
    ctaLabel: "Заполнить профиль",
    ctaPath: "/profile",
  },
  {
    no: "02",
    key: "hasDocuments",
    title: "Документы",
    hint: "Загрузите медицинские справки, заключения, выписки. Можно фото или PDF.",
    ctaLabel: "Загрузить документы",
    ctaPath: "/dashboard/medical-documents",
  },
  {
    no: "03",
    key: "hasAiAnalysis",
    title: "ИИ-анализ",
    hint: "ИИ извлечёт диагнозы, привяжет к статьям Расписания болезней, оценит шансы.",
    ctaLabel: "Запустить анализ",
    ctaPath: "/dashboard/medical-documents",
  },
  {
    no: "04",
    key: "hasLawyerLink",
    title: "Связь с юристом",
    hint: "Дайте юристу доступ к документам — получите стратегию и план действий.",
    ctaLabel: "Подключить юриста",
    ctaPath: "/dashboard",
  },
  {
    no: "05",
    key: "hasActiveSubscription",
    title: "Безлимит",
    hint: "Подписка снимает все лимиты ИИ-помощника и открывает прямой чат с юристом.",
    ctaLabel: "Оформить подписку",
    ctaPath: "/dashboard",
  },
];

const CaseRoadmap = () => {
  const progress = useCaseProgress();
  const navigate = useNavigate();

  const stages = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        done: progress[s.key] === true,
      })),
    [progress],
  );

  const nextStage = useMemo(() => stages.find((s) => !s.done) ?? null, [stages]);
  const completedCount = stages.filter((s) => s.done).length;

  const handleCall = () => {
    window.location.href = "tel:+79253500533";
  };

  if (progress.loading) {
    return (
      <div className="border border-ink/10 bg-paper-deep/40 p-6 flex items-center gap-3 text-ink-soft">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Загрузка вашего прогресса…</span>
      </div>
    );
  }

  return (
    <section
      className="border border-ink/10 bg-paper-deep/40"
      aria-labelledby="roadmap-heading"
    >
      {/* Header */}
      <header className="px-5 sm:px-7 py-5 border-b border-ink/10">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
            Ваше досье
          </span>
          <span className="h-px flex-1 bg-ink/15" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60">
            {completedCount} / {stages.length}
          </span>
        </div>
        <h2
          id="roadmap-heading"
          className="font-serif text-2xl sm:text-3xl text-ink leading-tight"
        >
          {nextStage ? "Дорожная карта дела" : "Дело собрано — пора в военкомат."}
        </h2>
        {nextStage && (
          <p className="text-sm text-ink-soft mt-1.5">
            Следующий шаг — <span className="text-ink font-medium">{nextStage.title}</span>. {nextStage.hint}
          </p>
        )}
      </header>

      {/* Next action highlight */}
      {nextStage && (
        <div className="px-5 sm:px-7 py-4 border-b border-ink/10 bg-gold/5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-gold text-ink font-mono text-sm font-semibold">
              {nextStage.no}
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep">
                Что сделать сейчас
              </p>
              <p className="font-serif text-lg text-ink leading-tight">
                {nextStage.title}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(nextStage.ctaPath)}
            className="group inline-flex items-center justify-center gap-2 px-5 py-3 bg-ink text-paper text-sm font-semibold hover:bg-gold hover:text-ink transition-colors"
          >
            {nextStage.ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      )}

      {/* Stages timeline */}
      <ol className="px-5 sm:px-7 py-6">
        {stages.map((s, i) => {
          const isCurrent = !s.done && stages.findIndex((x) => !x.done) === i;
          return (
            <li
              key={s.no}
              className={cn(
                "relative grid grid-cols-[2.5rem_1fr_auto] gap-4 items-start py-3",
                i < stages.length - 1 && "after:absolute after:left-[1.25rem] after:top-[3.5rem] after:bottom-[-0.75rem] after:w-px after:bg-ink/10",
              )}
            >
              {/* Status badge */}
              <div
                className={cn(
                  "relative z-10 w-10 h-10 flex items-center justify-center font-mono text-sm font-semibold border-2 transition-colors",
                  s.done
                    ? "bg-ink text-paper border-ink"
                    : isCurrent
                      ? "bg-gold text-ink border-gold"
                      : "bg-paper text-ink/40 border-ink/15",
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : s.no}
              </div>

              {/* Title + hint */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className={cn(
                      "font-serif text-base sm:text-lg leading-tight",
                      s.done ? "text-ink/60 line-through decoration-ink/30" : "text-ink",
                    )}
                  >
                    {s.title}
                  </h3>
                  {isCurrent && (
                    <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-gold-deep border border-gold/60 px-1.5 py-0.5">
                      сейчас
                    </span>
                  )}
                  {s.done && (
                    <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink/40">
                      готово
                    </span>
                  )}
                </div>
                {!s.done && (
                  <p className="text-xs sm:text-sm text-ink-soft mt-1 leading-relaxed">
                    {s.hint}
                  </p>
                )}
              </div>

              {/* Inline action */}
              {!s.done && (
                <Link
                  to={s.ctaPath}
                  className="text-xs font-mono tracking-wider uppercase text-gold-deep hover:text-ink whitespace-nowrap inline-flex items-center gap-1"
                >
                  Перейти
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* Bottom: request consultation */}
      <footer className="px-5 sm:px-7 py-4 border-t border-ink/10 bg-paper-deep/60 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
            — Когда нужен живой юрист
          </p>
          <p className="text-sm text-ink-soft leading-snug max-w-md">
            Запросите полноценную консультацию у Александры —
            онлайн или офлайн в Москве. Первая вводная бесплатна.
          </p>
        </div>
        <button
          onClick={handleCall}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-ink text-ink text-sm font-semibold hover:bg-ink hover:text-paper transition-colors whitespace-nowrap"
        >
          <Phone className="h-4 w-4" />
          Записаться
        </button>
      </footer>
    </section>
  );
};

export default CaseRoadmap;
