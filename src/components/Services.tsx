import { ArrowRight } from "lucide-react";
import { sectionNumber } from "@/lib/sectionNumbers";

const services = [
  {
    n: "01",
    title: "Юридическое сопровождение",
    tagline: "Полная защита прав на призывных мероприятиях",
    items: [
      "Анализ документов и личного дела призывника",
      "Составление возражений, жалоб и заявлений",
      "Представительство в призывной комиссии",
      "Обжалование решений в комиссии субъекта РФ",
      "Административный иск и судебная защита",
    ],
  },
  {
    n: "02",
    title: "Медико-правовой анализ",
    tagline: "Доказательная база на основе Расписания болезней",
    items: [
      "Аудит имеющихся медицинских документов",
      "Подбор статей Постановления №565 под диагноз",
      "Маршрутизация по обследованиям и врачам",
      "Подготовка к военно-врачебной комиссии",
      "Независимая медицинская экспертиза",
    ],
  },
  {
    n: "03",
    title: "Экстренная помощь",
    tagline: "Когда повестка пришла «вчера»",
    items: [
      "Срочный аудит за 24 часа",
      "Защита при незаконном задержании на медкомиссии",
      "Срочное обжалование с приостановкой призыва",
      "Связь и координация в режиме 24/7",
    ],
  },
  {
    n: "04",
    title: "ИИ-кабинет с надзором",
    tagline: "Самостоятельная работа под контролем юриста",
    items: [
      "Личный кабинет с дорожной картой дела",
      "Безлимитный анализ документов через ИИ",
      "База статей №565 и шаблоны заявлений",
      "Прямой чат с Важаниной при сложностях",
    ],
  },
];

const Services = () => {
  const handleConsultation = () => {
    window.location.href = "tel:+79253500533";
  };

  return (
    <section
      id="services"
      className="relative bg-paper-deep text-ink py-20 sm:py-28"
      aria-labelledby="services-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("services")}</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Услуги
          </span>
        </div>

        <h2
          id="services-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Четыре формата работы —
          <span className="block italic text-gold font-light">от срочной помощи до сопровождения «под ключ».</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          На бесплатной вводной консультации мы определим, какой формат вам подходит.
          Иногда достаточно одного письменного ответа военкомату — иногда нужно полноценное
          сопровождение через суд.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 lg:gap-x-16 gap-y-12 sm:gap-y-16">
          {services.map((s) => (
            <article
              key={s.n}
              className="group relative"
            >
              <div className="flex items-baseline gap-5 mb-5 pb-5 border-b border-ink/15">
                <span className="font-serif italic text-6xl sm:text-7xl text-gold/80 leading-none group-hover:text-gold transition-colors">
                  {s.n}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-2xl sm:text-3xl text-ink leading-tight">
                    {s.title}
                  </h3>
                  <p className="text-sm text-ink/65 mt-2 leading-snug">
                    {s.tagline}
                  </p>
                </div>
              </div>

              <ul className="space-y-2.5">
                {s.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm text-ink-soft leading-relaxed"
                  >
                    <span className="font-mono text-gold/70 mt-0.5 text-xs flex-shrink-0">
                      ▸
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-16 sm:mt-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-10 border-t border-ink/15">
          <div className="max-w-md">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              — Бесплатно
            </p>
            <p className="font-serif text-2xl text-ink leading-tight">
              Расскажите о своей ситуации — за 15 минут пойму, какой формат вам подходит.
            </p>
          </div>
          <button
            onClick={handleConsultation}
            className="group inline-flex items-center gap-3 px-7 py-4 bg-ink text-paper font-semibold whitespace-nowrap hover:bg-gold hover:text-ink transition-colors"
          >
            Записаться
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Services;
