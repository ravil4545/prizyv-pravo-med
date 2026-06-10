import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useBranding } from "@/contexts/BrandingContext";

interface FAQItem {
  q: string;
  a: string;
  link?: { to: string; label: string };
}

const FAQ_ITEMS: FAQItem[] = [
  {
    q: "Чем юрист отличается от «помогаторов в военкомате»?",
    a:
      "Юрист действует строго в рамках закона: оспаривает решения призывных комиссий, готовит независимые экспертизы, защищает в суде. «Помогаторы» обычно предлагают серые схемы — взятки, поддельные справки, фиктивные диагнозы. Это уголовная статья и для них, и для вас. Юридический путь надёжнее: при отрицательном решении суда у вас остаётся апелляция, при «договорняке» — статья 290 УК РФ.",
    link: { to: "/services", label: "Что входит в сопровождение" },
  },
  {
    q: "Сколько реально стоит освобождение от армии?",
    a:
      "От нуля до 200 тысяч рублей — в зависимости от стадии и сложности. Если у вас уже есть документально подтверждённый диагноз из «Расписания болезней», достаточно консультации юриста (от 9 000 ₽). Если военкомат игнорирует диагноз — нужно обжалование (от 30 000 ₽). Полное сопровождение под ключ с гарантией возврата гонорара — от 90 000 ₽.",
    link: { to: "#pricing", label: "Все тарифы" },
  },
  {
    q: "Что делать в день получения повестки?",
    a:
      "Не подписывать ничего лишнего. Расписаться только в факте получения. Сразу позвонить юристу или написать в WhatsApp — рассказать дату вызова и что написано в повестке. До явки в военкомат собрать копии всех медицинских документов за последние 3 года. На первый визит идти с юристом или после онлайн-инструктажа.",
    link: { to: "/blog", label: "Подробный гайд в блоге" },
  },
  {
    q: "Можно ли получить категорию В без обращения в военкомат?",
    a:
      "Нет — категорию присваивает только военно-врачебная комиссия. Но вы можете заранее собрать доказательную базу: пройти независимые обследования, получить заключение профильного врача, подобрать статью «Расписания болезней» под ваш диагноз. Тогда военкомат не сможет проигнорировать диагноз — будут юридические основания для обжалования.",
    link: { to: "/diagnoses", label: "База диагнозов" },
  },
  {
    q: "Что такое Постановление №565 и «Расписание болезней»?",
    a:
      "Постановление Правительства РФ от 04.07.2013 № 565 — это нормативный акт, утверждающий «Расписание болезней». В нём 88 статей с критериями годности по каждому диагнозу. Именно по нему ВВК ставит вам категорию А, Б, В, Г или Д. Зная вашу статью и её критерии, можно понять, на что вы реально претендуете.",
  },
  {
    q: "Гарантируете ли результат?",
    a:
      "Гарантировать категорию по закону нельзя — её присваивает государственный орган. Что я гарантирую: возврат гонорара при отрицательном решении суда — это прямо прописано в договоре. То есть если мы прошли все инстанции и не добились категории «В» или «Г» — деньги возвращаются.",
  },
  {
    q: "Работаете ли вы в регионах кроме Москвы?",
    a:
      "Юридическая работа — по всей РФ. Документы готовятся онлайн, представительство в комиссии — через доверенность. Очная встреча — в Москве или по видеосвязи. Судебные процессы — в районах прописки призывника, но я могу заявить ходатайство об участии онлайн.",
  },
  {
    q: "Что если военкомат уже отказал?",
    a:
      "У вас 10 дней с момента вручения решения на обжалование в призывную комиссию субъекта РФ (вышестоящую). Если и она откажет — административный иск в суд по КАС РФ. Призыв приостанавливается на время рассмотрения дела. Срочное обращение — экстренная помощь работает 24/7.",
  },
  {
    q: "Помогает ли ИИ-кабинет тем, кто не может позволить юриста?",
    a:
      "Да — это и есть основная идея. Подписка 4 990 ₽/мес даёт безлимитный анализ ваших документов, привязку к статьям 565, шаблоны заявлений и дорожную карту дела. Юрист подключается к чату, когда возникает сложная развилка. Для типовых случаев этого хватает — без оплаты полного сопровождения.",
    link: { to: "#subscription", label: "О подписке" },
  },
  {
    q: "Конфиденциально ли это?",
    a:
      "Все данные передаются по шифрованному каналу (HTTPS/TLS), хранятся в зашифрованной БД. Доступ — только у вас и юриста, которого вы явно подключили. Не передаём третьим лицам. Удаление данных по запросу в течение 24 часов согласно 152-ФЗ.",
    link: { to: "/privacy", label: "Политика конфиденциальности" },
  },
  {
    q: "Можно ли обжаловать решение в суде?",
    a:
      "Да, через административный иск по КАС РФ (Кодекс административного судопроизводства). Срок подачи — 3 месяца с момента, когда вы узнали о нарушении ваших прав. На время рассмотрения дела призыв приостанавливается. Судебная защита входит в тариф «Полное сопровождение» или оплачивается отдельно.",
  },
  {
    q: "А если у меня правда нет диагноза?",
    a:
      "Тогда честный путь — отсрочка по учёбе, семейным обстоятельствам, работе. Я не помогаю получать категорию «В» по выдуманным диагнозам — это и противозаконно, и небезопасно (фиктивная справка обнаруживается на ВВК). Но часто люди не знают о реальных диагнозах, которые годами не лечили — на бесплатной вводной мы это проверяем.",
  },
];

const buildFAQSchema = () => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
});

const FAQ = () => {
  const branding = useBranding();
  const phoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");

  const handlePhone = () => {
    window.location.href = `tel:+${phoneDigits}`;
  };

  // Inject FAQPage JSON-LD into page head. SEOHead уже добавляет один блок
  // structured data — мы создаём отдельный с уникальным id, чтобы не затирать.
  useEffect(() => {
    const ID = "faq-structured-data";
    let el = document.getElementById(ID) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = ID;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(buildFAQSchema());

    return () => {
      const existing = document.getElementById(ID);
      if (existing) existing.remove();
    };
  }, []);

  return (
    <section
      id="faq"
      className="relative bg-paper text-ink py-20 sm:py-28"
      aria-labelledby="faq-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 11</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Вопросы и ответы
          </span>
        </div>

        <h2
          id="faq-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Что спрашивают чаще всего
          <span className="block italic text-gold font-light">— краткие ответы, без воды.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          Если вашего вопроса нет в списке — напишите в Telegram или запишитесь на
          бесплатный разбор. Отвечаю в течение часа в рабочее время.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Side title + CTA */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
            <div className="bg-ink text-paper p-6 sm:p-8">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                — Не нашли ответ?
              </p>
              <h3 className="font-serif text-2xl leading-tight mb-5">
                Запишитесь на бесплатный разбор за 15 минут.
              </h3>
              <button
                onClick={handlePhone}
                className="group flex items-center justify-between w-full gap-3 px-4 py-3.5 bg-gold text-ink font-semibold text-sm hover:bg-paper transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Позвонить юристу
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <p className="text-[11px] text-paper/60 mt-3">
                Без обязательств. Только конкретный план действий.
              </p>
            </div>
          </aside>

          {/* Accordion */}
          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="border-y border-ink/15">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border-b border-ink/10 last:border-b-0"
                >
                  <AccordionTrigger className="text-left font-serif text-base sm:text-lg text-ink hover:text-gold py-5">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm sm:text-base text-ink-soft leading-relaxed pb-5">
                    <p className="mb-3">{item.a}</p>
                    {item.link && (
                      <Link
                        to={item.link.to}
                        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.2em] uppercase text-gold hover:underline"
                      >
                        {item.link.label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
