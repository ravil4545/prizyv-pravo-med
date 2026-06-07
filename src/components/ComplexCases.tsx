import { useState } from "react";
import { ArrowUpRight, FileText } from "lucide-react";

interface Case {
  no: string;
  year: string;
  diagnosis: string;
  article: string;
  initialCategory: string;
  finalCategory: string;
  duration: string;
  summary: string;
  outcome: string;
}

const cases: Case[] = [
  {
    no: "№ 247",
    year: "2023",
    diagnosis: "Сколиоз II степени с функциональными нарушениями",
    article: "ст. 66 «г»",
    initialCategory: "Б-3",
    finalCategory: "В",
    duration: "4 месяца",
    summary: "Военкомат отказался учитывать диагноз, поставленный в гражданской клинике. Назначили «своё» обследование, по итогам — годен.",
    outcome: "Независимая военно-врачебная экспертиза подтвердила углы Кобба. Решение комиссии отменено в суде первой инстанции.",
  },
  {
    no: "№ 418",
    year: "2024",
    diagnosis: "Артериальная гипертензия II стадии",
    article: "ст. 43",
    initialCategory: "Б-4",
    finalCategory: "В",
    duration: "6 месяцев",
    summary: "Диагноз был, но в анамнезе — единичные эпизоды. Военкомат игнорировал суточное мониторирование АД.",
    outcome: "Запросили повторное СМАД в условиях стационара, оформили дополнительные обследования по поражению органов-мишеней. Призывная комиссия субъекта пересмотрела решение без суда.",
  },
  {
    no: "№ 392",
    year: "2024",
    diagnosis: "Хронический пиелонефрит с нарушением функции почек",
    article: "ст. 71",
    initialCategory: "Г (отсрочка)",
    finalCategory: "В",
    duration: "1 год 2 мес.",
    summary: "Призывнику давали отсрочку на лечение, после которой давление вернулось. Военкомат настаивал на категории «Б» — «годен с ограничениями».",
    outcome: "Доказали хронический характер по двум обострениям в год, подтверждённым нефрологом. Освобождение от службы.",
  },
  {
    no: "№ 503",
    year: "2025",
    diagnosis: "Расстройство тревожно-депрессивного спектра",
    article: "ст. 17",
    initialCategory: "А",
    finalCategory: "В",
    duration: "8 месяцев",
    summary: "Призывник состоял у психиатра, но военкомат отказался запрашивать карту из ПНД. Категория «А» — годен без ограничений.",
    outcome: "Обжалование в военкомат субъекта с приложением выписки и направлением на стационарное обследование в ПНД. По результатам — категория «В».",
  },
  {
    no: "№ 561",
    year: "2025",
    diagnosis: "Плоскостопие III степени с артрозом",
    article: "ст. 68 «в»",
    initialCategory: "Б",
    finalCategory: "В",
    duration: "3 месяца",
    summary: "Снимки были, но рентгенограммы выполнены без нагрузки — военкомат заявил несоответствие методике.",
    outcome: "Назначили рентген стоп с нагрузкой в правильной проекции, оформили заключение ортопеда. Категория пересмотрена на призывной комиссии без обжалования.",
  },
];

const ComplexCases = () => {
  const [openCase, setOpenCase] = useState<string | null>(cases[0].no);

  return (
    <section
      id="cases"
      className="relative bg-paper text-ink py-20 sm:py-28"
      aria-labelledby="cases-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 04</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Архив дел
          </span>
        </div>

        <h2
          id="cases-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Реальные дела
          <span className="block italic text-gold font-light">— без вымысла и приукрашивания.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12">
          Каждая карточка — конкретный кейс из моей практики. Имена и идентифицирующие
          данные опущены по соглашению о конфиденциальности. Категории и статьи — точные.
        </p>

        {/* Archive table */}
        <div className="border-y border-ink/15">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[8rem_1fr_8rem_8rem_6rem_3rem] gap-4 py-3 border-b border-ink/15 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60">
            <span>№ дела · год</span>
            <span>диагноз / статья</span>
            <span>было</span>
            <span>стало</span>
            <span>срок</span>
            <span></span>
          </div>

          {cases.map((c) => {
            const isOpen = openCase === c.no;
            return (
              <article key={c.no} className="border-b border-ink/10 last:border-0">
                <button
                  onClick={() => setOpenCase(isOpen ? null : c.no)}
                  className="w-full text-left group focus:outline-none focus:bg-paper-deep/40 transition-colors"
                  aria-expanded={isOpen}
                >
                  <div className="grid grid-cols-[1fr_3rem] md:grid-cols-[8rem_1fr_8rem_8rem_6rem_3rem] gap-4 py-5 items-center">
                    <div className="col-start-1">
                      <div className="font-serif text-2xl md:text-3xl text-ink leading-none">
                        {c.no}
                      </div>
                      <div className="font-mono text-xs text-ink/55 mt-1">
                        {c.year}
                      </div>
                    </div>

                    <div className="hidden md:block min-w-0">
                      <div className="text-sm font-medium text-ink leading-snug">
                        {c.diagnosis}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-gold mt-1">
                        {c.article}
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <span className="inline-block px-2 py-1 border border-seal/40 text-seal font-mono text-xs">
                        {c.initialCategory}
                      </span>
                    </div>

                    <div className="hidden md:block">
                      <span className="inline-block px-2 py-1 border border-gold bg-gold/10 text-gold-deep font-mono text-xs font-semibold">
                        {c.finalCategory}
                      </span>
                    </div>

                    <div className="hidden md:block text-sm text-ink-soft">
                      {c.duration}
                    </div>

                    <div className="col-start-2 md:col-start-6 flex justify-end">
                      <span
                        className={`flex h-9 w-9 items-center justify-center border transition-all ${isOpen
                            ? "border-gold bg-gold text-ink rotate-45"
                            : "border-ink/30 text-ink/60 group-hover:border-gold group-hover:text-gold"
                          }`}
                        aria-hidden
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    {/* Mobile compact row */}
                    <div className="col-start-1 md:hidden">
                      <div className="text-sm font-medium text-ink leading-snug">
                        {c.diagnosis}
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="inline-block px-2 py-0.5 border border-seal/40 text-seal font-mono text-[11px]">
                          {c.initialCategory}
                        </span>
                        <span className="text-ink/40">→</span>
                        <span className="inline-block px-2 py-0.5 border border-gold bg-gold/10 text-gold-deep font-mono text-[11px] font-semibold">
                          {c.finalCategory}
                        </span>
                        <span className="font-mono text-[11px] text-ink/55">
                          {c.duration}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="pb-8 pt-2 pl-0 md:pl-[8rem] grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div>
                      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-seal mb-2">
                        Ситуация до обращения
                      </div>
                      <p className="text-sm text-ink-soft leading-relaxed">
                        {c.summary}
                      </p>
                    </div>
                    <div className="md:border-l md:border-gold/30 md:pl-10">
                      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
                        Что сделали
                      </div>
                      <p className="text-sm text-ink leading-relaxed">
                        {c.outcome}
                      </p>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex items-center gap-3 text-sm text-ink-soft">
          <FileText className="h-4 w-4 text-gold" />
          <span>
            За кадром ещё <span className="font-semibold text-ink">500+ дел</span> —
            показываю только те, где могу раскрыть детали без нарушения тайны.
          </span>
        </div>
      </div>
    </section>
  );
};

export default ComplexCases;
