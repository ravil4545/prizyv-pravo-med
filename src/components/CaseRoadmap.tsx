import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Loader2, Phone, Lock } from "lucide-react";
import { useCaseProgress } from "@/hooks/useCaseProgress";
import { cn } from "@/lib/utils";
import PaymentInstructionsDialog from "@/components/PaymentInstructionsDialog";

interface Stage {
  no: string;
  key: keyof Omit<ReturnType<typeof useCaseProgress>, "loading">;
  title: string;
  hint: string;
  ctaLabel: string;
  ctaPath: string;
  /** Если задано "payment" — CTA открывает диалог оплаты, а не навигацию.
   *  (Стадия «Безлимит» вела на /dashboard — текущую же страницу, клик был no-op.) */
  action?: "payment";
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
    action: "payment",
  },
];

/**
 * Будущие этапы сопровождения (Модуль 2 — удержание).
 *
 * Показываются заблокированными (greyed out) после основного роадмапа, чтобы
 * пользователь видел: сервис ведёт его не только до сбора документов, а через
 * весь призыв — есть ради чего оставаться в подписке. Разблокируются по мере
 * развития дела (пока — после оформления подписки, этап 05).
 */
const FUTURE_STAGES: { title: string; hint: string }[] = [
  {
    title: "Юридическое сопровождение при подаче документов",
    hint: "Юрист проверит комплект и поможет правильно подать заявление в военкомат.",
  },
  {
    title: "Прохождение медкомиссии и защита прав",
    hint: "Сопровождение на медосвидетельствовании — что говорить, какие права отстаивать.",
  },
  {
    title: "Контрольное медицинское освидетельствование (КМО)",
    hint: "Подготовка к КМО: документы по статье, тактика, защита категории годности.",
  },
  {
    title: "Получение военного билета / отсрочки",
    hint: "Финальный этап — фиксация решения и получение документа на руки.",
  },
];

const CaseRoadmap = () => {
  const progress = useCaseProgress();
  const navigate = useNavigate();
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Единая точка обработки CTA стадии: оплата → диалог, иначе → навигация.
  const handleStageCta = (stage: Pick<Stage, "action" | "ctaPath">) => {
    if (stage.action === "payment") setPaymentOpen(true);
    else navigate(stage.ctaPath);
  };

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
            onClick={() => handleStageCta(nextStage)}
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

              {/* Inline action: оплата → кнопка-диалог, иначе → ссылка-навигация */}
              {!s.done && (
                s.action === "payment" ? (
                  <button
                    type="button"
                    onClick={() => setPaymentOpen(true)}
                    className="text-xs font-mono tracking-wider uppercase text-gold-deep hover:text-ink whitespace-nowrap inline-flex items-center gap-1"
                  >
                    Оплатить
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : (
                  <Link
                    to={s.ctaPath}
                    className="text-xs font-mono tracking-wider uppercase text-gold-deep hover:text-ink whitespace-nowrap inline-flex items-center gap-1"
                  >
                    Перейти
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )
              )}
            </li>
          );
        })}
      </ol>

      {/* Future stages — заблокированные будущие этапы сопровождения (удержание) */}
      <div className="px-5 sm:px-7 pb-6 -mt-1">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/40">
            Дальше с вами
          </span>
          <span className="h-px flex-1 bg-ink/10" />
        </div>
        <ul className="space-y-2.5">
          {FUTURE_STAGES.map((f) => (
            <li
              key={f.title}
              className="grid grid-cols-[2.5rem_1fr] gap-4 items-start opacity-60"
            >
              <div className="relative z-10 w-10 h-10 flex items-center justify-center border-2 border-dashed border-ink/20 bg-paper">
                <Lock className="h-3.5 w-3.5 text-ink/40" />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-serif text-base sm:text-lg leading-tight text-ink/70">
                    {f.title}
                  </h3>
                  <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink/40 border border-ink/15 px-1.5 py-0.5">
                    скоро
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-ink-soft mt-1 leading-relaxed">
                  {f.hint}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom: request consultation */}
      <footer className="px-5 sm:px-7 py-4 border-t border-ink/10 bg-paper-deep/60 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
            — Когда нужен живой юрист
          </p>
          <p className="text-sm text-ink-soft leading-snug max-w-md">
            Запросите полноценную консультацию юриста —
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

      <PaymentInstructionsDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </section>
  );
};

export default CaseRoadmap;
