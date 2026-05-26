import { ArrowRight, Phone } from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";
import BrandedAvatar from "@/components/BrandedAvatar";

const credentials = [
  { label: "Образование", value: "Высшее юридическое" },
  { label: "Специализация", value: "Призывное и медицинское право" },
  { label: "Практика с", value: "2014 года" },
  { label: "Юрисдикция", value: "Российская Федерация" },
  { label: "Формат работы", value: "Очно (Москва) · Онлайн" },
  { label: "Конфиденциальность", value: "Адвокатская тайна" },
];

const principles = [
  {
    n: "01",
    title: "Только законные методы",
    body: "Никаких «знакомых в военкомате», никаких теневых схем. Защита строится исключительно на нормах права и доказательной медицинской базе.",
  },
  {
    n: "02",
    title: "Стратегия — до первого визита",
    body: "Прежде чем вы войдёте в военкомат, у вас на руках готовый план: какие документы предоставить, какие — придержать, какие отказы обжаловать и в какой срок.",
  },
  {
    n: "03",
    title: "Сопровождение, а не «проконсультировал и забыл»",
    body: "Если вы взяли сопровождение — я веду вас от первой повестки до военного билета. Каждое заседание комиссии, каждое заключение — под моим контролем.",
  },
];

const AboutLawyer = () => {
  const branding = useBranding();

  const handlePhoneCall = () => {
    const digits = (branding.phone || "+79253500533").replace(/\D/g, "");
    window.location.href = `tel:+${digits}`;
  };

  return (
    <section
      id="about"
      className="relative bg-paper text-ink py-20 sm:py-28"
      aria-labelledby="about-heading"
    >
      {/* Section header */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 02</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Об адвокате
          </span>
        </div>

        <h2
          id="about-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Юрист, к которому идут,
          <span className="block italic text-gold font-light">когда сложно.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-16">
          За 10+ лет — сотни выигранных дел: освобождение от службы по здоровью,
          обжалование решений призывных комиссий в судах, защита прав уклоняющихся от
          незаконных вызовов. Беру не каждое дело — только те, в которых вижу
          доказательную перспективу.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Portrait + credentials sidebar */}
          <aside className="lg:col-span-5">
            <div className="relative max-w-md mx-auto lg:mx-0">
              {/* Frame corners */}
              <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-ink z-10" aria-hidden />
              <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-ink z-10" aria-hidden />
              <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-ink z-10" aria-hidden />
              <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-ink z-10" aria-hidden />

              <div className="bg-paper-deep overflow-hidden shadow-medium">
                <div className="relative w-full aspect-[3/4]">
                  <BrandedAvatar
                    src={branding.photoUrl}
                    name={branding.displayName}
                    className="absolute inset-0"
                  />
                </div>
                <div className="px-4 py-3 border-t border-ink/10 flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase">
                  <span className="text-ink/60">
                    Досье · {branding.displayName.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "ЮР"}
                  </span>
                  <span className="text-gold">оригинал</span>
                </div>
              </div>
            </div>

            {/* Credentials card — archival table */}
            <dl className="mt-10 max-w-md mx-auto lg:mx-0 bg-paper-deep/60 border border-ink/10 p-6">
              <h3 className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-4">
                Личное дело
              </h3>
              {credentials.map((c, i) => (
                <div
                  key={c.label}
                  className={`flex items-baseline justify-between py-2.5 ${i < credentials.length - 1 ? "border-b border-ink/8" : ""
                    } gap-3`}
                >
                  <dt className="font-mono text-[10px] tracking-wider uppercase text-ink/60">
                    {c.label}
                  </dt>
                  <dd className="text-sm font-medium text-ink text-right">{c.value}</dd>
                </div>
              ))}
            </dl>
          </aside>

          {/* Principles — numbered editorial list */}
          <div className="lg:col-span-7 space-y-8">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
              — Принципы работы
            </p>

            {principles.map((p) => (
              <article key={p.n} className="group grid grid-cols-[auto_1fr] gap-6 pb-8 border-b border-ink/10 last:border-0">
                <span className="font-serif italic text-5xl sm:text-6xl text-gold/80 leading-none group-hover:text-gold transition-colors">
                  {p.n}
                </span>
                <div>
                  <h3 className="font-serif text-xl sm:text-2xl text-ink mb-3 leading-tight">
                    {p.title}
                  </h3>
                  <p className="text-ink-soft leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </article>
            ))}

            <div className="pt-4">
              <button
                onClick={handlePhoneCall}
                className="group inline-flex items-center gap-3 px-6 py-4 bg-ink text-paper font-semibold hover:bg-gold hover:text-ink transition-colors duration-300"
              >
                <Phone className="h-5 w-5" />
                Бесплатная вводная — 15 минут
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutLawyer;
