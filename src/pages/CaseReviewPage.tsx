import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Loader2,
  Stethoscope,
  Scale,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Clock,
  FileText,
  Sparkles,
  Phone,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useBranding } from "@/contexts/BrandingContext";
import { sectionNumber } from "@/lib/sectionNumbers";
import {
  CaseReviewError,
  DOCUMENTS_OPTIONS,
  STAGE_OPTIONS,
  readinessLabel,
  requestCaseReview,
  urgencyLabel,
  type HasDocuments,
  type ReviewResult,
  type ReviewStage,
} from "@/lib/caseReview";

// ════════════════════════════════════════════════════════════════════════
//  «Разбор за 3 минуты» — единая дверь для холодного трафика (§2).
//
//  Раньше у человека с повесткой в руках не было одной двери: на первом экране
//  конкурировали шесть действий, а «что делать дальше» нигде не было сказано
//  одной фразой. Здесь он отвечает на 4 вопроса и получает персональный план,
//  разделённый на медицинскую и юридическую части.
//
//  Разбор доступен БЕЗ регистрации: гейт стоит на сохранении результата, а не
//  на его получении. Это и есть момент, когда человек готов зарегистрироваться —
//  он уже видит свой план и не хочет его потерять.
// ════════════════════════════════════════════════════════════════════════

const CaseReviewPage = () => {
  const navigate = useNavigate();
  const branding = useBranding();

  const [stage, setStage] = useState<ReviewStage | null>(null);
  const [complaint, setComplaint] = useState("");
  const [hasDocuments, setHasDocuments] = useState<HasDocuments | null>(null);
  const [conscriptionDate, setConscriptionDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const canSubmit = Boolean(stage && hasDocuments && complaint.trim().length >= 3);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);
    trackEvent("case_review_submit");

    try {
      const data = await requestCaseReview({
        stage: stage!,
        complaint: complaint.trim(),
        hasDocuments: hasDocuments!,
        conscriptionDate: conscriptionDate || undefined,
      });
      setResult(data);
      trackEvent("case_review_result");
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      const message = err instanceof CaseReviewError
        ? err.message
        : "Не удалось собрать разбор. Проверьте соединение и попробуйте ещё раз.";
      setError(message);
      if (err instanceof CaseReviewError && err.rateLimited) trackEvent("case_review_rate_limited");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    trackEvent("case_review_save_click");
    navigate("/auth?mode=signup&next=/dashboard/case-tracking");
  };

  const handleCall = () => {
    trackEvent("case_review_call_click");
    const digits = (branding.phone || "+79253500533").replace(/\D/g, "");
    window.location.href = `tel:+${digits}`;
  };

  const urgency = result ? urgencyLabel(result.daysUntilConscription) : null;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Разбор дела призывника за 3 минуты — бесплатно | nepriziv.ru"
        description="Опишите ситуацию — получите план: под какие статьи Расписания болезней вы попадаете, что нужно собрать по медицинской части и какие заявления подать по юридической. Без регистрации."
        keywords="разбор дела призывника, что делать с повесткой, какие документы нужны военкомату, статьи расписания болезней, план действий призывника"
      />
      <Header />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 pb-24 md:pb-16">
        <div className="max-w-3xl mx-auto">
          {/* ── Шапка ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("review")}</span>
            <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">Разбор</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-[1.05] mb-4">
            Разбор вашего дела
            <span className="block italic text-gold font-light mt-1">за 3 минуты, бесплатно.</span>
          </h1>

          <p className="max-w-2xl text-base text-ink-soft leading-relaxed mb-8">
            Четыре вопроса — и вы получите план: под какие статьи Расписания болезней подходит ваша
            ситуация, что нужно собрать <strong className="text-ink">по медицинской части</strong> и какие
            заявления подать <strong className="text-ink">по юридической</strong>.
          </p>

          {/* ── Форма ─────────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 1. Этап */}
            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                Вопрос 1 · Что случилось
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStage(opt.value)}
                    className={cn(
                      "text-left p-4 border transition-colors",
                      stage === opt.value
                        ? "border-gold bg-gold/10"
                        : "border-ink/20 hover:border-gold/60",
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                    <span className="block text-xs text-ink-soft mt-0.5">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* 2. Жалоба */}
            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                Вопрос 2 · Диагноз или жалоба
              </legend>
              {/* ym-hide-content: описание здоровья не попадает в записи Вебвизора (152-ФЗ) */}
              <textarea
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Своими словами: что беспокоит, как давно, что говорили врачи. Например: «астма с 12 лет, стоял на учёте, сейчас обострений почти нет»"
                className="ym-hide-content w-full border border-ink/20 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:border-gold transition-colors resize-y"
              />
              <p className="mt-1.5 text-[11px] text-ink/50">
                Чем конкретнее — тем точнее разбор. Медицинские термины не обязательны.
              </p>
            </fieldset>

            {/* 3. Документы */}
            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                Вопрос 3 · Есть ли медицинские документы
              </legend>
              <div className="flex flex-wrap gap-2">
                {DOCUMENTS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setHasDocuments(opt.value)}
                    className={cn(
                      "px-4 py-2.5 border text-sm transition-colors",
                      hasDocuments === opt.value
                        ? "border-gold bg-gold/10 text-ink"
                        : "border-ink/20 text-ink-soft hover:border-gold/60",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* 4. Дата */}
            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                Вопрос 4 · Дата призывных мероприятий
                <span className="ml-2 normal-case tracking-normal text-ink/40">не обязательно</span>
              </legend>
              <input
                type="date"
                value={conscriptionDate}
                onChange={(e) => setConscriptionDate(e.target.value)}
                className="border border-ink/20 bg-paper px-4 py-3 text-sm text-ink focus:outline-none focus:border-gold transition-colors"
              />
              <p className="mt-1.5 text-[11px] text-ink/50">
                Если знаете дату явки — подскажем, что успеть в срок.
              </p>
            </fieldset>

            {error && (
              <div className="border border-seal/30 bg-seal/5 px-4 py-3 text-sm text-seal">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="group inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-gold text-ink font-semibold text-sm hover:bg-gold-deep hover:text-paper transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {loading ? "Собираем разбор…" : "Получить разбор"}
                {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </button>
              <p className="mt-2.5 text-[11px] font-mono tracking-wide text-ink/50">
                Бесплатно · без регистрации · ответ за ~30 секунд
              </p>
            </div>
          </form>

          {/* ── Результат ─────────────────────────────────────────────── */}
          {result && (
            <div ref={resultRef} className="mt-14 scroll-mt-20">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">Ваш разбор</span>
                <span className="h-px flex-1 bg-ink/15" />
                {urgency && (
                  <span
                    className={cn(
                      "font-mono text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1.5",
                      urgency.urgent ? "text-seal" : "text-ink/50",
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {urgency.text}
                  </span>
                )}
              </div>

              {result.summary && (
                <p className="text-base text-ink leading-relaxed mb-8 border-l-2 border-gold pl-4">
                  {result.summary}
                </p>
              )}

              {/* ① Ситуация по закону */}
              {result.articles.length > 0 && (
                <section className="mb-10">
                  <h2 className="font-serif text-xl text-ink mb-4">① Ваша ситуация по закону</h2>
                  <ul className="space-y-3">
                    {result.articles.map((a) => (
                      <li key={a.number + a.title} className="border border-ink/15 p-4">
                        <Link
                          to={`/diagnoses/${encodeURIComponent(a.number)}`}
                          className="font-mono text-xs text-gold-deep hover:underline"
                        >
                          ст. {a.number} →
                        </Link>
                        <p className="font-serif text-lg text-ink mt-1">{a.title}</p>
                        {a.why && <p className="text-sm text-ink-soft mt-1.5">{a.why}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Готовность дела — намеренно НЕ вероятность */}
              <section className="mb-10 border border-ink/15 p-5 bg-paper-deep/30">
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <h2 className="font-serif text-xl text-ink">Готовность дела</h2>
                  <span className="font-mono text-sm text-gold-deep tabular-nums">
                    {result.readiness.score} / 10
                  </span>
                </div>
                <div className="h-2 w-full bg-ink/10 mb-2 overflow-hidden">
                  <div
                    className="h-full bg-gold transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, result.readiness.score * 10))}%` }}
                  />
                </div>
                <p className="text-sm text-ink-soft mb-4">{readinessLabel(result.readiness.score)}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {result.readiness.confirmed.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50 mb-2">
                        Что уже подтверждено
                      </p>
                      <ul className="space-y-1.5">
                        {result.readiness.confirmed.map((c) => (
                          <li key={c} className="text-sm text-ink-soft flex gap-2">
                            <span className="text-gold shrink-0">✓</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.readiness.missing.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50 mb-2">
                        Что снижает готовность
                      </p>
                      <ul className="space-y-1.5">
                        {result.readiness.missing.map((m) => (
                          <li key={m} className="text-sm text-ink-soft flex gap-2">
                            <span className="text-seal shrink-0">!</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <p className="mt-4 text-[11px] text-ink/50 leading-relaxed">
                  Это оценка полноты документов, а не прогноз решения комиссии. Шкала показывает, что
                  сделать, чтобы её поднять.
                </p>
              </section>

              {/* ② Медицинская часть */}
              {result.medical.length > 0 && (
                <section className="mb-10">
                  <h2 className="font-serif text-xl text-ink mb-1 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-gold" />
                    ② Что нужно по медицинской части
                  </h2>
                  <p className="text-sm text-ink-soft mb-4">Это то, чем подтверждается сам диагноз.</p>
                  <ul className="border-t border-ink/15">
                    {result.medical.map((item) => (
                      <li key={item.title} className="border-b border-ink/10 py-4">
                        <p className="text-sm font-semibold text-ink flex gap-2.5">
                          <span className="text-ink/30 shrink-0">☐</span>
                          {item.title}
                        </p>
                        {item.why && <p className="text-sm text-ink-soft mt-1 pl-6">{item.why}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ③ Юридическая часть */}
              {result.legal.length > 0 && (
                <section className="mb-10">
                  <h2 className="font-serif text-xl text-ink mb-1 flex items-center gap-2">
                    <Scale className="h-5 w-5 text-gold" />
                    ③ Что нужно по юридической части
                  </h2>
                  <p className="text-sm text-ink-soft mb-4">
                    Это то, чем диагноз оформляется по закону. Без этих шагов документы юридически не
                    существуют.
                  </p>
                  <ul className="border-t border-ink/15">
                    {result.legal.map((item) => (
                      <li key={item.title} className="border-b border-ink/10 py-4">
                        <p className="text-sm font-semibold text-ink flex gap-2.5">
                          <span className="text-ink/30 shrink-0">☐</span>
                          {item.title}
                        </p>
                        {item.why && <p className="text-sm text-ink-soft mt-1 pl-6">{item.why}</p>}
                        {item.templateKey && (
                          // Редактор шаблонов живёт в кабинете. Аноним идёт на
                          // регистрацию с сохранённым next — после входа сразу
                          // откроется нужный шаблон, а не общий каталог.
                          // Подпись честная: не обещаем «без регистрации».
                          <Link
                            to={`/auth?mode=signup&next=${encodeURIComponent(
                              `/dashboard/templates?template=${item.templateKey}`,
                            )}`}
                            className="ml-6 mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            Заполнить шаблон
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Гейт — на сохранении, а не на получении */}
              <section className="border-2 border-gold/40 bg-gold/5 p-6">
                <h2 className="font-serif text-xl text-ink mb-2">Сохранить разбор</h2>
                <p className="text-sm text-ink-soft mb-5">
                  Создайте бесплатный аккаунт, чтобы план не потерялся: отмечайте выполненные пункты,
                  загружайте документы на проверку ИИ и следите за сроками.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleSave}
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-ink text-paper font-semibold text-sm hover:bg-gold hover:text-ink transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Сохранить план
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  <button
                    onClick={handleCall}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-ink/30 text-ink font-medium text-sm hover:border-gold hover:text-gold-deep transition-colors"
                  >
                    <Phone className="h-4 w-4 text-gold" />
                    Обсудить с юристом — бесплатно
                  </button>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink/50">
                  <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                  Без обязательств · описание здоровья не передаётся третьим лицам
                </p>
              </section>

              <p className="mt-6 text-[11px] text-ink/50 leading-relaxed">{result.disclaimer}</p>

              <button
                onClick={() => {
                  setResult(null);
                  setError(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="mt-6 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-gold-deep transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Пройти разбор заново
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CaseReviewPage;
