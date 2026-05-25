import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Phone } from "lucide-react";

interface Plan {
  no: string;
  name: string;
  price: string;
  unit: string;
  desc: string;
  includes: string[];
  cta: { label: string; action: "phone" | "dashboard" };
  highlight?: boolean;
  badge?: string;
}

const plans: Plan[] = [
  {
    no: "01",
    name: "Вводная консультация",
    price: "Бесплатно",
    unit: "15–20 минут",
    desc: "Знакомство, оценка ситуации, план дальнейших действий — без обязательств.",
    includes: [
      "Краткий анализ вашего случая",
      "Ответы на ключевые вопросы",
      "Оценка перспектив",
      "Рекомендация формата работы",
    ],
    cta: { label: "Записаться", action: "phone" },
  },
  {
    no: "02",
    name: "ИИ-кабинет",
    price: "от 9 000 ₽",
    unit: "в месяц",
    desc: "Самостоятельная работа с ИИ-помощником под надзором юриста.",
    includes: [
      "Безлимитные ИИ-консультации",
      "Анализ медицинских документов",
      "База статей Постановления №565",
      "Прямой чат с юристом",
      "Дорожная карта дела",
    ],
    cta: { label: "Подключить кабинет", action: "dashboard" },
    highlight: true,
    badge: "Популярно",
  },
  {
    no: "03",
    name: "Консультация юриста",
    price: "от 9 000 ₽",
    unit: "за встречу",
    desc: "Полная индивидуальная консультация онлайн или офлайн в Москве.",
    includes: [
      "Анализ документов и личного дела",
      "Стратегия защиты ваших прав",
      "Подбор статей Расписания болезней",
      "Письменное заключение",
      "Запись разговора по запросу",
    ],
    cta: { label: "Записаться", action: "phone" },
  },
  {
    no: "04",
    name: "Полное сопровождение",
    price: "от 90 000 ₽",
    unit: "под ключ",
    desc: "Юрист ведёт ваше дело от первой повестки до военного билета.",
    includes: [
      "Подготовка всех документов",
      "Представительство в военкомате",
      "Обжалование решений призывной комиссии",
      "Судебная защита по КАС РФ",
      "Личный куратор 24/7",
      "Возврат гонорара при отрицательном решении суда",
    ],
    cta: { label: "Обсудить дело", action: "phone" },
    badge: "Под ключ",
  },
];

const Pricing = () => {
  const navigate = useNavigate();

  const handle = (action: "phone" | "dashboard") => {
    if (action === "phone") {
      window.location.href = "tel:+79253500533";
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <section
      id="pricing"
      className="relative bg-paper text-ink py-20 sm:py-28"
      aria-labelledby="pricing-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 06</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Прайс
          </span>
        </div>

        <h2
          id="pricing-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Прозрачные тарифы
          <span className="block italic text-gold font-light">— без скрытых строк.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          Начните с бесплатной вводной — финальная стоимость работ озвучивается после
          анализа документов. Никаких «допуслуг» по ходу.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {plans.map((plan) => (
            <article
              key={plan.no}
              className={`relative flex flex-col border ${plan.highlight
                  ? "border-gold bg-ink text-paper"
                  : "border-ink/20 bg-paper"
                } p-7 sm:p-9 transition-all hover:shadow-medium`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3 right-6 px-3 py-1 font-mono text-[10px] tracking-[0.2em] uppercase ${plan.highlight ? "bg-gold text-ink" : "bg-ink text-paper"
                    }`}
                >
                  {plan.badge}
                </div>
              )}

              <div className="flex items-baseline gap-4 mb-4 pb-5 border-b border-current/15">
                <span
                  className={`font-serif italic text-5xl leading-none ${plan.highlight ? "text-gold" : "text-gold/80"
                    }`}
                >
                  {plan.no}
                </span>
                <div>
                  <h3
                    className={`font-serif text-2xl leading-tight ${plan.highlight ? "text-paper" : "text-ink"
                      }`}
                  >
                    {plan.name}
                  </h3>
                </div>
              </div>

              <div className="mb-4">
                <div
                  className={`font-serif text-4xl sm:text-5xl ${plan.highlight ? "text-gold" : "text-ink"
                    } leading-none`}
                >
                  {plan.price}
                </div>
                <div
                  className={`font-mono text-[11px] tracking-[0.15em] uppercase mt-2 ${plan.highlight ? "text-paper/65" : "text-ink/55"
                    }`}
                >
                  {plan.unit}
                </div>
              </div>

              <p
                className={`text-sm leading-relaxed mb-6 ${plan.highlight ? "text-paper/80" : "text-ink-soft"
                  }`}
              >
                {plan.desc}
              </p>

              <ul className="space-y-2.5 mb-7 flex-1">
                {plan.includes.map((it) => (
                  <li
                    key={it}
                    className={`flex gap-3 text-sm leading-relaxed ${plan.highlight ? "text-paper/85" : "text-ink-soft"
                      }`}
                  >
                    <span className="font-mono text-gold mt-0.5 text-xs flex-shrink-0">
                      ▸
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handle(plan.cta.action)}
                className={`group inline-flex items-center justify-between gap-3 px-5 py-3.5 font-semibold text-sm w-full transition-colors ${plan.highlight
                    ? "bg-gold text-ink hover:bg-paper"
                    : "bg-ink text-paper hover:bg-gold hover:text-ink"
                  }`}
              >
                <span className="flex items-center gap-2">
                  {plan.cta.action === "phone" ? (
                    <Phone className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                  {plan.cta.label}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </article>
          ))}
        </div>

        <p className="text-center text-sm text-ink/55 mt-10 max-w-2xl mx-auto italic font-serif">
          «Стоимость работы — это всегда зеркало риска. Чем сложнее дело, тем выше цена
          ошибки. Я не беру за то, что не могу довести до результата.»
        </p>
      </div>
    </section>
  );
};

export default Pricing;
