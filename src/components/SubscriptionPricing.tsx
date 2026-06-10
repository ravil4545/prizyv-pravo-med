import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Zap,
  TrendingDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/contexts/BrandingContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type BillingCycle = "month" | "year";

interface Plan {
  cycle: BillingCycle;
  badge?: string;
  price: number;
  priceLabel: string;
  unit: string;
  perMonth?: string;
  saving?: string;
  cta: string;
}

const plans: Plan[] = [
  {
    cycle: "month",
    price: 4990,
    priceLabel: "4 990 ₽",
    unit: "в месяц",
    cta: "Начать 3 дня бесплатно",
  },
  {
    cycle: "year",
    badge: "Экономия 17%",
    price: 49900,
    priceLabel: "49 900 ₽",
    unit: "в год",
    perMonth: "≈ 4 158 ₽/мес",
    saving: "Экономия 9 980 ₽",
    cta: "Начать 3 дня бесплатно",
  },
];

const features = [
  { label: "Безлимитные ИИ-консультации", included: [true, true] },
  { label: "Анализ медицинских документов (PDF, фото, DOCX)", included: [true, true] },
  { label: "База из 88 статей Постановления №565", included: [true, true] },
  { label: "Дорожная карта дела", included: [true, true] },
  { label: "Шаблоны заявлений и жалоб", included: [true, true] },
  { label: "Календарь дедлайнов и напоминания", included: [true, true] },
  { label: "Приоритетная обработка обращений", included: [false, true] },
  { label: "Консультация юриста — за доплату, от 9 000 ₽", included: [false, false] },
];

const comparison = [
  {
    param: "Знание Постановления №565",
    chatgpt: "поверхностное",
    ours: "88 статей вшито",
    lawyer: "полное",
    ourBest: false,
  },
  {
    param: "Анализ ваших документов",
    chatgpt: "по тексту, без памяти",
    ours: "с памятью между сессиями",
    lawyer: "очно, ограниченно",
    ourBest: true,
  },
  {
    param: "Дорожная карта дела",
    chatgpt: "нет",
    ours: "автоматическая",
    lawyer: "при сопровождении",
    ourBest: false,
  },
  {
    param: "Скорость ответа",
    chatgpt: "секунды",
    ours: "секунды",
    lawyer: "часы — дни",
    ourBest: false,
  },
  {
    param: "Цена в месяц",
    chatgpt: "бесплатно / 2000 ₽",
    ours: "4 990 ₽",
    lawyer: "9 000 ₽ за консультацию",
    ourBest: false,
  },
  {
    param: "Юридическая ответственность",
    chatgpt: "нет",
    ours: "под надзором юриста",
    lawyer: "полная по договору",
    ourBest: false,
  },
];

const faq = [
  {
    q: "Чем это отличается от ChatGPT?",
    a: "ChatGPT не знает Постановления №565 в деталях, забывает ваши документы между сессиями и не несёт ответственности за советы. Наш ИИ обучен на 88 статьях расписания болезней, помнит ваши загруженные документы между чатами, и каждый сложный ответ проверяется юристом.",
  },
  {
    q: "Что входит в подписку?",
    a: "Безлимитные ИИ-консультации, анализ медицинских документов, доступ к базе статей №565, шаблоны заявлений, дорожная карта дела и календарь дедлайнов. В годовом тарифе дополнительно — приоритетная обработка. Консультация и сопровождение юриста в подписку не входят — это отдельная платная услуга (от 9 000 ₽).",
  },
  {
    q: "Что НЕ входит?",
    a: "Представительство в военкомате, подача документов от вашего имени, судебная защита и личное участие юриста в комиссиях — это отдельные услуги «Консультация» и «Полное сопровождение» из основного прайса.",
  },
  {
    q: "Можно ли отменить подписку?",
    a: "Да, в один клик в личном кабинете. Доступ к функциям сохранится до конца оплаченного периода. Возврат за неиспользованную часть — по условиям публичной оферты.",
  },
  {
    q: "Безопасны ли мои данные?",
    a: "Медицинские документы хранятся в зашифрованном виде. Доступ только у вас и у юриста, которого вы явно подключите. Не передаём третьим лицам. Удаляем по запросу в течение 24 часов.",
  },
  {
    q: "Что будет после 7-дневного пробного периода?",
    a: "Если вы не отмените подписку, в 8-й день спишется выбранный тариф. За день до списания мы пришлём напоминание на email. Отмена доступна в один клик и до, и после списания.",
  },
];

const SubscriptionPricing = () => {
  const navigate = useNavigate();
  const branding = useBranding();
  // По умолчанию — месячный тариф (4 990 ₽), а не годовой.
  const [activeCycle, setActiveCycle] = useState<BillingCycle>("month");

  const startTrial = async () => {
    const dashboard = `${branding.routePrefix}/dashboard?pay=trial`;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      navigate(dashboard);
    } else {
      navigate(`${branding.routePrefix}/auth?next=${encodeURIComponent(dashboard)}`);
    }
  };

  const activePlan = plans.find((p) => p.cycle === activeCycle) ?? plans[0];
  const activeIdx = activeCycle === "year" ? 1 : 0;

  return (
    <section
      id="subscription"
      className="relative bg-ink text-paper py-20 sm:py-28"
      aria-labelledby="subscription-heading"
    >
      {/* Background paper texture (subtle gold dots over ink) */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--gold)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 07</span>
          <span className="h-px flex-1 bg-gold/30 max-w-[80px]" />
          <span className="font-mono text-gold/80 text-xs tracking-[0.25em] uppercase">
            ИИ-кабинет
          </span>
        </div>

        <h2
          id="subscription-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          ИИ-кабинет под надзором юриста
          <span className="block italic text-gold font-light text-3xl sm:text-4xl md:text-5xl mt-2">
            — не ChatGPT с пустыми ответами.
          </span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-paper/75 leading-relaxed mb-12 sm:mb-16">
          Юридическая база, обученная на 88 статьях Постановления №565. Анализ
          ваших документов, дорожная карта дела и календарь дедлайнов — за цену
          обеда в день. Консультация юриста — отдельно, от 9 000 ₽.
        </p>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-20">
          {/* Left: billing toggle + plan summary */}
          <div className="lg:col-span-7">
            {/* Cycle toggle */}
            <div className="inline-flex items-center gap-1 border border-paper/20 p-1 mb-8" role="tablist" aria-label="Период оплаты">
              {plans.map((p) => (
                <button
                  key={p.cycle}
                  role="tab"
                  aria-selected={activeCycle === p.cycle}
                  onClick={() => setActiveCycle(p.cycle)}
                  className={`relative px-4 sm:px-6 py-2.5 font-mono text-[11px] sm:text-xs tracking-[0.2em] uppercase transition-colors ${
                    activeCycle === p.cycle
                      ? "bg-gold text-ink"
                      : "text-paper/70 hover:text-paper"
                  }`}
                >
                  {p.cycle === "month" ? "Месяц" : "Год"}
                  {p.badge && (
                    <span className="ml-2 text-[9px] text-seal font-semibold normal-case tracking-normal">
                      −17%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Active plan card */}
            <article className="border-2 border-gold bg-paper/5 backdrop-blur-sm p-7 sm:p-9">
              <div className="flex items-baseline gap-4 pb-5 border-b border-paper/15">
                <span className="font-serif italic text-5xl leading-none text-gold">
                  {activeCycle === "month" ? "01" : "02"}
                </span>
                <div className="flex-1">
                  <h3 className="font-serif text-2xl sm:text-3xl text-paper leading-tight">
                    {activeCycle === "month" ? "Месячный" : "Годовой"}
                  </h3>
                  {activePlan.badge && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gold text-ink font-mono text-[10px] tracking-[0.15em] uppercase font-semibold">
                      {activePlan.badge}
                    </span>
                  )}
                </div>
              </div>

              <div className="mb-6 mt-6">
                <div className="font-serif text-5xl sm:text-6xl text-gold leading-none">
                  {activePlan.priceLabel}
                </div>
                <div className="font-mono text-[11px] tracking-[0.15em] uppercase mt-3 text-paper/65">
                  {activePlan.unit}
                </div>
                {activePlan.perMonth && (
                  <div className="text-sm text-paper/80 mt-3 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-gold" />
                    {activePlan.perMonth} · {activePlan.saving}
                  </div>
                )}
              </div>

              <ul className="space-y-2.5 mb-8">
                {features.map((f, i) => (
                  <li
                    key={f.label}
                    className={`flex gap-3 text-sm leading-relaxed ${
                      f.included[activeIdx] ? "text-paper/90" : "text-paper/35 line-through"
                    }`}
                  >
                    {f.included[activeIdx] ? (
                      <Check className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-paper/30 mt-0.5 flex-shrink-0" />
                    )}
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={startTrial}
                className="group inline-flex items-center justify-between gap-3 px-5 py-4 bg-gold text-ink font-semibold text-sm w-full transition-colors hover:bg-paper"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {activePlan.cta}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>

              <p className="text-[11px] text-paper/55 mt-3 leading-relaxed">
                3 дня — без списания (9 документов и 9 вопросов к ИИ). Отмена в один клик.
                После пробного периода спишется {activePlan.priceLabel} {activePlan.unit}.
              </p>
            </article>
          </div>

          {/* Right: ROI block */}
          <aside className="lg:col-span-5 space-y-6">
            <div className="border border-paper/15 p-6 sm:p-8 bg-paper/5">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-4">
                — Сколько вы экономите
              </p>
              <h3 className="font-serif text-2xl sm:text-3xl text-paper leading-tight mb-5">
                Подписка окупается с шестой консультации.
              </h3>
              <dl className="space-y-4 text-sm">
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-paper/10">
                  <dt className="text-paper/70">Разовая консультация юриста</dt>
                  <dd className="font-serif text-lg text-paper">9 000 ₽</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-paper/10">
                  <dt className="text-paper/70">Подписка на год</dt>
                  <dd className="font-serif text-lg text-paper">49 900 ₽</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <dt className="text-gold font-semibold">С 6-й консультации в году</dt>
                  <dd className="font-serif text-2xl text-gold">в плюсе</dd>
                </div>
              </dl>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
              {[
                { icon: Zap, label: "Ответ за секунды", desc: "Не ждёте часы и дни." },
                { icon: ShieldCheck, label: "Под надзором юриста", desc: "Сложные ответы проверяются." },
                { icon: Bot, label: "Помнит ваши документы", desc: "В отличие от ChatGPT." },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 p-4 border border-paper/10">
                  <Icon className="h-5 w-5 text-gold flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-paper leading-tight">{label}</p>
                    <p className="text-xs text-paper/65 mt-1 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Comparison table */}
        <div className="mb-20">
          <h3 className="font-serif text-2xl sm:text-3xl text-paper mb-2">
            ChatGPT vs ИИ-кабинет vs Очный юрист
          </h3>
          <p className="text-sm text-paper/65 mb-8 max-w-2xl">
            Честное сравнение по шести параметрам, которые реально важны для исхода вашего дела.
          </p>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full border-y border-paper/15">
              <thead>
                <tr className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/60">
                  <th className="text-left py-4 px-4 font-normal">Параметр</th>
                  <th className="text-left py-4 px-4 font-normal">ChatGPT</th>
                  <th className="text-left py-4 px-4 font-normal text-gold border-x border-gold/30 bg-gold/5">
                    ИИ-кабинет
                  </th>
                  <th className="text-left py-4 px-4 font-normal">Очный юрист</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr
                    key={row.param}
                    className={`text-sm leading-snug ${
                      i < comparison.length - 1 ? "border-b border-paper/10" : ""
                    }`}
                  >
                    <td className="py-4 px-4 text-paper font-medium align-top">
                      {row.param}
                    </td>
                    <td className="py-4 px-4 text-paper/65 align-top">{row.chatgpt}</td>
                    <td
                      className={`py-4 px-4 align-top border-x border-gold/30 bg-gold/5 ${
                        row.ourBest ? "text-gold font-semibold" : "text-paper"
                      }`}
                    >
                      {row.ours}
                    </td>
                    <td className="py-4 px-4 text-paper/65 align-top">{row.lawyer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-12">
          <div className="lg:col-span-4">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
              — Часто спрашивают
            </p>
            <h3 className="font-serif text-2xl sm:text-3xl text-paper leading-tight mb-4">
              Ответы на 6 главных вопросов о подписке.
            </h3>
            <p className="text-sm text-paper/65 leading-relaxed">
              Не нашли свой? Напишите в Telegram или WhatsApp — отвечаем в течение часа в рабочее время.
            </p>
          </div>

          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="border-y border-paper/15">
              {faq.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border-b border-paper/10 last:border-b-0"
                >
                  <AccordionTrigger className="text-left font-serif text-base sm:text-lg text-paper hover:text-gold py-5">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-paper/75 leading-relaxed pb-5">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>

        {/* Final CTA */}
        <div className="border border-gold/40 p-6 sm:p-10 bg-gold/5 flex flex-col sm:flex-row items-start sm:items-center gap-6 justify-between">
          <div className="max-w-md">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              — Без обязательств
            </p>
            <p className="font-serif text-xl sm:text-2xl text-paper leading-tight">
              Попробуйте 3 дня бесплатно — отмена в один клик.
            </p>
          </div>
          <button
            onClick={startTrial}
            className="group inline-flex items-center gap-3 px-6 sm:px-7 py-4 bg-gold text-ink font-semibold whitespace-nowrap hover:bg-paper transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Начать пробный период
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default SubscriptionPricing;
