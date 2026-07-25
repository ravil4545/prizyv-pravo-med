import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { GraduationCap, ScrollText, ZoomIn } from "lucide-react";
import { sectionNumber } from "@/lib/sectionNumbers";

interface Diploma {
  /** Путь к фото в /public/diplomas/. Файл кладётся вручную (см. README в папке). */
  src: string;
  title: string;
  subtitle: string;
  org: string;
  year: string;
}

// Дипломы юриста платформы. Регистрационные/серийные номера на фото
// намеренно скрыты — публикуем только подтверждение квалификации.
const DIPLOMAS: Diploma[] = [
  {
    src: "/diplomas/master-gmu-2019.jpg",
    title: "Магистр",
    subtitle: "Государственное и муниципальное управление (38.04.04)",
    org: "Московский финансово-промышленный университет «Синергия», Москва",
    year: "2019",
  },
  {
    src: "/diplomas/jurist-2012.jpg",
    title: "Высшее образование",
    subtitle: "Юриспруденция · учитель права",
    org: "Российский государственный профессионально-педагогический университет, Екатеринбург",
    year: "2012",
  },
  {
    src: "/diplomas/spo-2008.jpg",
    title: "Среднее профессиональное",
    subtitle: "Правоведение · юрист",
    org: "Кемеровский государственный профессионально-педагогический колледж",
    year: "2008",
  },
];

const Credentials = () => {
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <section className="py-16 sm:py-20 bg-paper-deep/20 border-y border-ink/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          {/* Заголовок секции */}
          <div className="text-center mb-10 sm:mb-12">
            {/* Секция была единственной на главной без номера — из-за неё
                последовательность «№ NN» визуально рвалась. */}
            <div className="font-mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-gold mb-3">
              {sectionNumber("credentials")} · Квалификация
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-ink mb-3">
              Дипломы и образование
            </h2>
            <p className="text-base text-ink-soft max-w-2xl mx-auto leading-relaxed">
              Профильное юридическое образование, подтверждённое государственными
              дипломами. Нажмите на диплом, чтобы рассмотреть подробнее.
            </p>
          </div>

          {/* Сетка дипломов */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {DIPLOMAS.map((d) => (
              <div key={d.src} className="group">
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="relative block w-full aspect-[4/3] overflow-hidden rounded-lg border border-ink/15 bg-paper transition-colors hover:border-gold/60"
                      aria-label={`Открыть диплом: ${d.title}, ${d.year}`}
                    >
                      {failed[d.src] ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink/40">
                          <ScrollText className="h-10 w-10" />
                          <span className="text-xs">Фото диплома</span>
                        </div>
                      ) : (
                        <img
                          src={d.src}
                          alt={`Диплом — ${d.title}, ${d.org}, ${d.year}`}
                          loading="lazy"
                          decoding="async"
                          onError={() => setFailed((p) => ({ ...p, [d.src]: true }))}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      )}
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-paper opacity-0 transition-opacity group-hover:opacity-100">
                        <ZoomIn className="h-3 w-3" /> Увеличить
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl p-2 sm:p-3">
                    {!failed[d.src] && (
                      <img
                        src={d.src}
                        alt={`Диплом — ${d.title}, ${d.org}, ${d.year}`}
                        decoding="async"
                        className="h-auto w-full rounded"
                      />
                    )}
                    <div className="px-2 pb-1 pt-2">
                      <p className="font-serif text-lg text-ink">
                        {d.title} · {d.year}
                      </p>
                      <p className="text-sm text-ink-soft">{d.subtitle}</p>
                      <p className="mt-0.5 text-xs text-ink/50">{d.org}</p>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Подпись под фото */}
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 flex-shrink-0 text-gold-deep" />
                    <p className="text-sm font-semibold text-ink">
                      {d.title} · {d.year}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">{d.subtitle}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink/50">{d.org}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Credentials;
