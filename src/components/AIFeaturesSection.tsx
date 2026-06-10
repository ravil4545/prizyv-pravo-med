import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  MessageSquare,
  Map,
  Sparkles,
  Check,
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";

interface Feature {
  no: string;
  icon: typeof FileText;
  title: string;
  bullet: string;
  desc: string;
  mock: React.ReactNode;
}

const DocumentMock = () => (
  <div className="absolute inset-0 p-4 flex flex-col gap-2 bg-paper text-ink overflow-hidden">
    <div className="flex items-center gap-2 pb-2 border-b border-ink/10">
      <div className="flex h-7 w-7 items-center justify-center bg-gold/15 text-gold">
        <FileText className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink/55 truncate">
          spravka-ortoped.pdf
        </div>
        <div className="text-[9px] text-ink/45">Анализ · 4 сек</div>
      </div>
      <span className="text-[9px] font-mono uppercase tracking-wider text-gold-deep bg-gold/15 px-1.5 py-0.5">
        готово
      </span>
    </div>
    <div className="space-y-1.5">
      <div className="text-[10px] text-ink/80 leading-snug">
        Найдено в документе:
      </div>
      <div className="flex items-start gap-1.5 text-[10px]">
        <Check className="h-2.5 w-2.5 text-gold mt-0.5 flex-shrink-0" />
        <span className="text-ink/75">Плоскостопие III степени</span>
      </div>
      <div className="flex items-start gap-1.5 text-[10px]">
        <Check className="h-2.5 w-2.5 text-gold mt-0.5 flex-shrink-0" />
        <span className="text-ink/75">Артроз таранно-ладьевидного сустава</span>
      </div>
    </div>
    <div className="mt-auto pt-2 border-t border-ink/10">
      <div className="text-[9px] font-mono uppercase tracking-wider text-ink/55 mb-1">
        Привязка к статье 565
      </div>
      <div className="inline-block px-2 py-0.5 bg-ink text-paper text-[10px] font-mono">
        ст. 68 «в» · категория В
      </div>
    </div>
  </div>
);

const RoadmapMock = () => (
  <div className="absolute inset-0 p-4 flex flex-col gap-2 bg-paper text-ink overflow-hidden">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink/55 mb-1">
      Дорожная карта дела
    </div>
    {[
      { state: "done", label: "Загрузить медкарту", date: "27 мая" },
      { state: "done", label: "Получить выписку у ортопеда", date: "02 июня" },
      { state: "active", label: "Рентген стоп с нагрузкой", date: "10 июня" },
      { state: "todo", label: "Подать в призывную комиссию", date: "20 июня" },
      { state: "todo", label: "Военно-врачебная экспертиза", date: "Июль" },
    ].map((s, i) => (
      <div key={i} className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
            s.state === "done"
              ? "bg-gold border-gold"
              : s.state === "active"
                ? "border-gold bg-paper"
                : "border-ink/25 bg-paper"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-[10px] truncate leading-tight ${
              s.state === "done"
                ? "text-ink/50 line-through"
                : s.state === "active"
                  ? "text-ink font-semibold"
                  : "text-ink/65"
            }`}
          >
            {s.label}
          </div>
        </div>
        <div className="text-[9px] font-mono text-ink/45 flex-shrink-0">{s.date}</div>
      </div>
    ))}
  </div>
);

const ChatMock = () => (
  <div className="absolute inset-0 p-4 flex flex-col gap-2 bg-paper text-ink overflow-hidden">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink/55 mb-1">
      ИИ-помощник · с памятью
    </div>
    <div className="self-end max-w-[80%] bg-ink text-paper px-3 py-2 text-[10px] leading-snug rounded-sm">
      Что говорит ст. 66 о моём диагнозе?
    </div>
    <div className="self-start max-w-[90%] bg-paper-deep text-ink px-3 py-2 text-[10px] leading-snug rounded-sm border border-ink/10">
      По вашей справке от ортопеда (загружено 27 мая) — это сколиоз II степени.
      По <span className="font-semibold text-gold-deep">ст. 66 «г»</span> вы попадаете под
      категорию <span className="font-semibold">«В»</span>, если угол Кобба &gt; 17°.
    </div>
    <div className="self-start flex items-center gap-1 text-[9px] text-ink/45 font-mono">
      <Sparkles className="h-2.5 w-2.5 text-gold" />
      Помню ваши документы. ChatGPT — нет.
    </div>
  </div>
);

const features: Feature[] = [
  {
    no: "01",
    icon: FileText,
    title: "ИИ-анализ медкарты",
    bullet: "30 секунд вместо часа у юриста",
    desc:
      "Загружаете фото справки или PDF — ИИ извлекает диагнозы, привязывает к статьям Постановления №565 и показывает, каким статьям они соответствуют и каких документов не хватает.",
    mock: <DocumentMock />,
  },
  {
    no: "02",
    icon: Map,
    title: "Дорожная карта дела",
    bullet: "Видите весь путь — от повестки до решения комиссии",
    desc:
      "Каждое обследование, каждая комиссия и каждый дедлайн — в одной таймлайн-карте. ИИ обновляет шаги по мере поступления новых документов.",
    mock: <RoadmapMock />,
  },
  {
    no: "03",
    icon: MessageSquare,
    title: "Чат с памятью документов",
    bullet: "ИИ помнит ваши справки между диалогами",
    desc:
      "В отличие от ChatGPT, наш ИИ работает в контексте всех ваших загруженных документов. Не нужно каждый раз объяснять «у меня сколиоз и плоскостопие».",
    mock: <ChatMock />,
  },
];

const AIFeaturesSection = () => {
  const navigate = useNavigate();
  const branding = useBranding();
  const trialPath = `${branding.routePrefix}/auth?next=${encodeURIComponent(`${branding.routePrefix}/dashboard?pay=trial`)}`;

  return (
    <section
      id="ai-features"
      className="relative bg-paper-deep text-ink py-20 sm:py-28"
      aria-labelledby="ai-features-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 08</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Как работает ИИ-кабинет
          </span>
        </div>

        <h2
          id="ai-features-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Три инструмента,
          <span className="block italic text-gold font-light">которых нет в ChatGPT.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          Не пустые ответы общего ИИ — а связка «ваши документы → статьи Постановления
          №565 → конкретные действия». Показываем, как это выглядит изнутри.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-12">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <article
                key={f.no}
                className="group relative flex flex-col border border-ink/15 bg-paper hover:border-gold transition-colors"
              >
                {/* Mock window */}
                <div className="relative h-56 sm:h-64 border-b border-ink/15 bg-paper-deep overflow-hidden">
                  <div className="absolute top-0 inset-x-0 px-3 py-1.5 bg-ink text-paper flex items-center gap-1.5 z-10">
                    <span className="h-1.5 w-1.5 rounded-full bg-seal/70" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-gold/50" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-paper/30" aria-hidden />
                    <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-paper/70 truncate">
                      nepriziv.ru · ИИ-кабинет
                    </span>
                  </div>
                  <div className="absolute inset-0 pt-7">{f.mock}</div>
                </div>

                <div className="p-6 sm:p-7 flex flex-col flex-1">
                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="font-serif italic text-3xl text-gold/80 leading-none group-hover:text-gold transition-colors">
                      {f.no}
                    </span>
                    <Icon className="h-4 w-4 text-gold/70 flex-shrink-0" />
                  </div>

                  <h3 className="font-serif text-xl sm:text-2xl text-ink leading-tight mb-2">
                    {f.title}
                  </h3>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
                    {f.bullet}
                  </p>
                  <p className="text-sm text-ink-soft leading-relaxed flex-1">{f.desc}</p>
                </div>
              </article>
            );
          })}
        </div>

        {/* Final CTA strip */}
        <div className="border border-ink/15 bg-paper p-6 sm:p-9 flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
          <div className="max-w-md">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              — Без обязательств
            </p>
            <p className="font-serif text-xl sm:text-2xl text-ink leading-tight">
              Загрузите первую справку — посмотрите, как ИИ её разбирает.
            </p>
          </div>
          <button
            onClick={() => navigate(trialPath)}
            className="group inline-flex items-center gap-3 px-6 sm:px-7 py-4 bg-ink text-paper font-semibold whitespace-nowrap hover:bg-gold hover:text-ink transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Попробовать 3 дня бесплатно
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default AIFeaturesSection;
