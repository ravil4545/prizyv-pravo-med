import { useState } from "react";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { sectionNumber } from "@/lib/sectionNumbers";

interface Station {
  step: string;
  name: string;
  short: string;
  problems: string[];
  solutions: string[];
}

const stations: Station[] = [
  {
    step: "01",
    name: "Повестка",
    short: "Получение, вручение, неявка",
    problems: [
      "Повестку вручили не лично, а под дверь или родственнику",
      "В повестке нет печати, подписи или обязательных реквизитов",
      "Повестка пришла после истечения призывного периода",
      "Угрозы уголовным преследованием за неявку",
    ],
    solutions: [
      "Проверка повестки на соответствие ст. 31 ФЗ «О воинской обязанности»",
      "Письменный ответ военкомату с указанием нарушений",
      "Подача заявления о незаконных действиях в прокуратуру",
      "Защита от давления — все коммуникации только через юриста",
    ],
  },
  {
    step: "02",
    name: "Медкомиссия",
    short: "Освидетельствование врачами",
    problems: [
      "Игнорирование медицинских документов и диагнозов",
      "Назначение «своих» обследований в карманных клиниках",
      "Категорию ставят формально, без осмотра",
      "Заключение составлено без ссылок на Расписание болезней",
    ],
    solutions: [
      "Сбор досье до явки — заранее знаем, какие статьи №565 применимы",
      "Сопровождение на комиссию или письменное представление документов",
      "Запрос копии акта освидетельствования (по ст. 5.1 п. 4)",
      "Независимая медицинская экспертиза — основание для пересмотра",
    ],
  },
  {
    step: "03",
    name: "Призывная комиссия",
    short: "Решение о категории",
    problems: [
      "Решение принято без вашего присутствия",
      "Категория «Б» вместо «В» — расхождение со статьёй №565",
      "Отказ выдать копию решения",
      "Срок обжалования (3 месяца) на исходе, военкомат тянет",
    ],
    solutions: [
      "Истребование протокола заседания — обязательная процедура",
      "Письменное обжалование в призывную комиссию субъекта РФ",
      "Параллельно — административное исковое заявление в суд",
      "Приостановка решения комиссии до рассмотрения жалобы",
    ],
  },
  {
    step: "04",
    name: "Суд",
    short: "Обжалование решения",
    problems: [
      "Решение комиссии вступило в силу — рискуете быть отправленным",
      "В суде сторона военкомата — опытные юристы Минобороны",
      "Слабая доказательная база, нет независимой экспертизы",
      "Незнание процессуальных сроков и форм",
    ],
    solutions: [
      "Подготовка административного иска по КАС РФ",
      "Ходатайство о приостановлении призыва на время разбирательства",
      "Назначение судебной военно-врачебной экспертизы",
      "Представительство в суде первой инстанции и апелляции",
    ],
  },
  {
    step: "05",
    name: "Военный билет",
    short: "Получение и сохранение",
    problems: [
      "Военкомат тянет с выдачей билета после решения",
      "Категорию задним числом изменяют на «годен»",
      "Требуют дополнительные обследования без оснований",
    ],
    solutions: [
      "Письменный запрос с фиксированным сроком выдачи (10 дней)",
      "Жалоба в военный комиссариат субъекта РФ",
      "Иск об оспаривании бездействия должностных лиц",
    ],
  },
];

const ConscriptionMap = () => {
  const [activeStep, setActiveStep] = useState(0);
  const active = stations[activeStep];

  return (
    <section
      id="map"
      className="relative bg-ink text-paper py-20 sm:py-28 overflow-hidden"
      aria-labelledby="map-heading"
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--gold)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--gold)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
        aria-hidden
      />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("map")}</span>
          <span className="h-px flex-1 bg-gold/30 max-w-[80px]" />
          <span className="font-mono text-gold/70 text-xs tracking-[0.25em] uppercase">
            Карта призывных мероприятий
          </span>
        </div>

        <h2
          id="map-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Где система ломается —
          <span className="block italic text-gold font-light">и где я её собираю обратно.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-paper/75 leading-relaxed mb-12 sm:mb-16">
          Призывной процесс — пять станций. На каждой военкомат может допустить нарушение,
          которое потом стоит вам года жизни. Кликните на этап — увидите типичные проблемы
          и точные процессуальные ходы.
        </p>

        {/* Station timeline */}
        <div className="relative mb-10 sm:mb-12">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-6 left-0 right-0 h-px bg-paper/15" aria-hidden />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 relative">
            {stations.map((s, i) => {
              const isActive = i === activeStep;
              const isPassed = i < activeStep;
              return (
                <button
                  key={s.step}
                  onClick={() => setActiveStep(i)}
                  className="group text-left focus:outline-none"
                  aria-pressed={isActive}
                >
                  <div className="flex items-center mb-3">
                    <div
                      className={`relative z-10 w-12 h-12 flex items-center justify-center font-mono text-sm font-semibold transition-all border-2 ${isActive
                          ? "bg-gold text-ink border-gold"
                          : isPassed
                            ? "bg-paper/10 text-gold border-gold/40"
                            : "bg-ink text-paper/60 border-paper/25 group-hover:border-gold/60 group-hover:text-paper"
                        }`}
                    >
                      {s.step}
                    </div>
                  </div>
                  <div
                    className={`font-serif text-base sm:text-lg leading-tight transition-colors ${isActive ? "text-gold" : "text-paper group-hover:text-gold/90"
                      }`}
                  >
                    {s.name}
                  </div>
                  <div className="text-xs text-paper/55 mt-1 leading-snug">
                    {s.short}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active station details — problems vs solutions */}
        <div className="border-t border-paper/15 pt-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {/* Problems */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 border border-seal flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-seal" />
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-seal/90">
                    Что обычно идёт не так
                  </div>
                  <div className="font-serif text-xl text-paper">
                    Этап «{active.name}»
                  </div>
                </div>
              </div>
              <ul className="space-y-3">
                {active.problems.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-paper/85 leading-relaxed">
                    <span className="font-mono text-seal/80 mt-1 flex-shrink-0">×</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Solutions */}
            <div className="border-l-0 md:border-l md:border-gold/20 md:pl-12">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 border border-gold flex items-center justify-center">
                  <Check className="h-4 w-4 text-gold" />
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                    Как решаю
                  </div>
                  <div className="font-serif text-xl text-paper">
                    Алгоритм Важаниной
                  </div>
                </div>
              </div>
              <ul className="space-y-3">
                {active.solutions.map((s) => (
                  <li key={s} className="flex gap-3 text-sm text-paper/85 leading-relaxed">
                    <ChevronRight className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConscriptionMap;
