import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BrandedAvatar from "@/components/BrandedAvatar";
import {
  Phone, Send, MessageCircle, Mail, ArrowRight, ScrollText, Scale, FileText,
} from "lucide-react";

type BrandTemplate = "classic" | "editorial" | "minimal";

interface LawyerBrand {
  user_id: string;
  full_name: string | null;
  brand_subtitle: string | null;
  brand_about: string | null;
  photo_url: string | null;
  brand_phone: string | null;
  brand_telegram: string | null;
  brand_whatsapp: string | null;
  brand_email: string | null;
  accent_color: string | null;
  brand_template: BrandTemplate | null;
  slug: string;
}

/**
 * Личный лендинг юриста по адресу /u/:slug
 *
 * Три радикально разных шаблона — каждый с собственным характером:
 *  · classic   — тёплая адвокатская визитка с золотыми орнаментами, серифом
 *  · editorial — настоящая газетная полоса (многоколоночник, рубрики, врезки)
 *  · minimal   — современный tech-минимал с gradient mesh и крупной типографикой
 *
 * В каждый шаблон встроен компактный «закон.факт» — 3 общих правовых тезиса
 * (без услуг конкретного юриста — это его контакт и кабинет, не контент сайта).
 */
const LawyerLandingPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<LawyerBrand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase
        .from("lawyer_profiles")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      setBrand((data as any) || null);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-64 w-full max-w-xl" />
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-background">
        <p className="text-xl font-semibold">Юрист не найден</p>
        <p className="text-sm text-muted-foreground">
          Возможно, ссылка устарела или адрес введён с ошибкой.
        </p>
        <Button onClick={() => navigate("/")}>На главную nepriziv.ru</Button>
      </div>
    );
  }

  const tpl = (brand.brand_template || "classic") as BrandTemplate;

  switch (tpl) {
    case "editorial": return <EditorialTemplate brand={brand} />;
    case "minimal":   return <MinimalTemplate brand={brand} />;
    default:          return <ClassicTemplate brand={brand} />;
  }
};

// ── Общие хелперы ────────────────────────────────────────────────────────────

const buildContacts = (b: LawyerBrand) => ({
  phone: b.brand_phone
    ? () => { window.location.href = `tel:${b.brand_phone!.replace(/\D/g, "")}`; }
    : null,
  telegram: b.brand_telegram
    ? () => {
        const tg = b.brand_telegram!;
        const url = tg.startsWith("http") ? tg : `https://t.me/${tg.replace(/^@/, "")}`;
        window.open(url, "_blank");
      }
    : null,
  whatsapp: b.brand_whatsapp
    ? () => {
        const wa = b.brand_whatsapp!.replace(/\D/g, "");
        window.open(`https://wa.me/${wa}`, "_blank");
      }
    : null,
  email: b.brand_email
    ? () => { window.location.href = `mailto:${b.brand_email}`; }
    : null,
});

const ENTER_PATH = (slug: string) => `/u/${slug}/auth`;

// Общие правовые тезисы — одинаковые факты, разный визуал подачи в каждом шаблоне.
// Дозированно: 3 пункта, без воды и без услуг конкретного юриста.
const LEGAL_FACTS = [
  {
    icon: Scale,
    title: "Статья 23 53-ФЗ",
    text: "Гражданин освобождается от призыва, если по результатам медицинского освидетельствования признан негодным или ограниченно годным к военной службе.",
  },
  {
    icon: ScrollText,
    title: "Постановление № 565",
    text: "«Расписание болезней» — нормативный документ, по которому призывная комиссия определяет категорию годности. Содержит 88 статей.",
  },
  {
    icon: FileText,
    title: "Статья 28 53-ФЗ",
    text: "Решение призывной комиссии можно обжаловать в призывной комиссии субъекта РФ или в суде в течение трёх месяцев.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ШАБЛОН 1: CLASSIC — тёплая адвокатская визитка с орнаментами
// Кремовый фон, золотые декоры по углам, серифные заголовки, тёплая бумага.
// ═══════════════════════════════════════════════════════════════════════════

const ClassicTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#B8893C";

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-stone-900">
      {/* Декоративная плашка-печать сверху */}
      <div className="border-b-2 border-double" style={{ borderColor: accent }}>
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="font-serif italic text-xs tracking-wider" style={{ color: accent }}>
            Юридическая практика
          </div>
          <div className="font-serif text-xs tracking-[0.3em] uppercase text-stone-600">
            est. {new Date().getFullYear()}
          </div>
        </div>
      </div>

      {/* Главный блок-визитка */}
      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="relative bg-white shadow-xl border border-stone-200 px-8 sm:px-14 py-12 sm:py-16">
          {/* Уголковые орнаменты */}
          <CornerOrnament position="tl" color={accent} />
          <CornerOrnament position="tr" color={accent} />
          <CornerOrnament position="bl" color={accent} />
          <CornerOrnament position="br" color={accent} />

          <div className="text-center">
            <BrandedAvatar
              src={brand.photo_url || ""}
              name={brand.full_name || "Юрист"}
              shape="round"
              className="h-28 w-28 mx-auto ring-4 ring-offset-4"
              style={{ "--tw-ring-color": accent } as React.CSSProperties}
            />

            {/* Орнаментальный разделитель */}
            <div className="flex items-center justify-center gap-3 mt-7">
              <div className="h-px w-12" style={{ background: accent }} />
              <div className="w-2 h-2 rotate-45" style={{ background: accent }} />
              <div className="h-px w-12" style={{ background: accent }} />
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 mt-5">{brand.full_name}</h1>
            {brand.brand_subtitle && (
              <p className="font-serif italic text-base text-stone-600 mt-2">
                {brand.brand_subtitle}
              </p>
            )}

            {brand.brand_about && (
              <p className="font-serif text-base leading-relaxed text-stone-700 mt-7 max-w-xl mx-auto">
                {brand.brand_about}
              </p>
            )}
          </div>

          <div className="mt-10 flex items-center justify-center gap-3">
            <div className="h-px flex-1" style={{ background: `${accent}55` }} />
            <span className="font-serif italic text-xs uppercase tracking-widest" style={{ color: accent }}>
              Связаться
            </span>
            <div className="h-px flex-1" style={{ background: `${accent}55` }} />
          </div>

          {(c.phone || c.telegram || c.whatsapp || c.email) && (
            <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-stone-700">
              {c.phone    && <button onClick={c.phone}    className="inline-flex items-center gap-1.5 text-sm font-serif hover:opacity-70"><Phone className="h-4 w-4" style={{ color: accent }} />{brand.brand_phone}</button>}
              {c.telegram && <button onClick={c.telegram} className="inline-flex items-center gap-1.5 text-sm font-serif hover:opacity-70"><Send className="h-4 w-4" style={{ color: accent }} />Telegram</button>}
              {c.whatsapp && <button onClick={c.whatsapp} className="inline-flex items-center gap-1.5 text-sm font-serif hover:opacity-70"><MessageCircle className="h-4 w-4" style={{ color: accent }} />WhatsApp</button>}
              {c.email    && <button onClick={c.email}    className="inline-flex items-center gap-1.5 text-sm font-serif hover:opacity-70"><Mail className="h-4 w-4" style={{ color: accent }} />{brand.brand_email}</button>}
            </div>
          )}

          <a
            href={ENTER_PATH(brand.slug)}
            className="mt-8 inline-flex items-center justify-center gap-2 w-full py-3.5 font-serif text-base tracking-wide transition-all hover:tracking-wider"
            style={{ background: accent, color: "#FAF6EE" }}
          >
            Открыть личный кабинет <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {/* «Закон.факт» — стилизовано под раздел свитка */}
        <section className="mt-12">
          <div className="text-center mb-6">
            <p className="font-serif italic text-sm" style={{ color: accent }}>
              ※ Полезно знать ※
            </p>
            <h2 className="font-serif text-2xl text-stone-800 mt-1">Что говорит закон</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {LEGAL_FACTS.map((f, i) => (
              <article key={i} className="bg-white border border-stone-200 px-5 py-6 relative">
                <span
                  className="absolute -top-3 left-5 px-2 py-0.5 font-serif italic text-[10px] tracking-widest uppercase"
                  style={{ background: accent, color: "#FAF6EE" }}
                >
                  {f.title}
                </span>
                <p className="font-serif text-sm leading-relaxed text-stone-700 mt-2">{f.text}</p>
              </article>
            ))}
          </div>
          <p className="text-center font-serif italic text-xs text-stone-500 mt-5">
            Общая правовая справка. Конкретику разбирает юрист — обратитесь по контактам выше.
          </p>
        </section>
      </main>

      <footer className="border-t border-stone-200 mt-12">
        <div className="container mx-auto px-6 py-4 font-serif italic text-xs text-stone-500 text-center">
          Личная практика на платформе nepriziv.ru · {brand.slug}
        </div>
      </footer>
    </div>
  );
};

const CornerOrnament = ({ position, color }: { position: "tl" | "tr" | "bl" | "br"; color: string }) => {
  const pos = {
    tl: "top-2 left-2",
    tr: "top-2 right-2 rotate-90",
    bl: "bottom-2 left-2 -rotate-90",
    br: "bottom-2 right-2 rotate-180",
  }[position];
  return (
    <svg className={`absolute ${pos} w-8 h-8 opacity-60`} viewBox="0 0 32 32" fill="none">
      <path d="M2 2 L14 2 M2 2 L2 14" stroke={color} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1.5" fill={color} />
      <path d="M6 6 Q10 6 10 10" stroke={color} strokeWidth="1" fill="none" />
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ШАБЛОН 2: EDITORIAL — настоящая газетная полоса
// Многоколоночный текст, плашка-шапка с датой, рубрики, врезка-цитата.
// ═══════════════════════════════════════════════════════════════════════════

const EditorialTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Газетная шапка-маска (masthead) */}
      <header className="border-b-4 border-double border-ink">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.3em] text-ink/60 border-b border-ink/15 pb-2">
            <span>{dateStr}</span>
            <span>выпуск · {brand.slug}</span>
          </div>
          <h1 className="font-serif text-5xl sm:text-7xl text-center pt-4 tracking-tight">
            ПРАВО НА ОТКАЗ
          </h1>
          <p className="text-center font-serif italic text-sm text-ink-soft mt-1">
            Личная колонка юриста по призывному и медицинскому праву
          </p>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {/* Передовица: 4-колоночный газетный layout */}
        <article className="grid md:grid-cols-12 gap-8 mb-12">
          {/* Левая колонка — портрет + подпись + контакты */}
          <aside className="md:col-span-4">
            {brand.photo_url ? (
              <figure>
                <img src={brand.photo_url} alt="" className="w-full aspect-[3/4] object-cover border border-ink" />
                <figcaption className="font-serif italic text-xs text-ink/60 mt-2 text-center">
                  {brand.full_name}
                  {brand.brand_subtitle && <> · {brand.brand_subtitle}</>}
                </figcaption>
              </figure>
            ) : (
              <BrandedAvatar
                src=""
                name={brand.full_name || "Юрист"}
                shape="square"
                className="w-full aspect-[3/4] border border-ink"
              />
            )}

            <div className="mt-6 border-t-2 border-b-2 border-ink/30 py-3 space-y-1.5">
              <p className="font-mono uppercase text-[9px] tracking-[0.3em] text-ink/50 mb-1">Связь с автором</p>
              {c.phone    && <button onClick={c.phone}    className="block text-left text-sm hover:text-gold w-full"><Phone className="inline h-3 w-3 mr-1.5 text-gold" />{brand.brand_phone}</button>}
              {c.telegram && <button onClick={c.telegram} className="block text-left text-sm hover:text-gold w-full"><Send className="inline h-3 w-3 mr-1.5 text-gold" />Telegram</button>}
              {c.whatsapp && <button onClick={c.whatsapp} className="block text-left text-sm hover:text-gold w-full"><MessageCircle className="inline h-3 w-3 mr-1.5 text-gold" />WhatsApp</button>}
              {c.email    && <button onClick={c.email}    className="block text-left text-sm hover:text-gold w-full"><Mail className="inline h-3 w-3 mr-1.5 text-gold" />{brand.brand_email}</button>}
            </div>
          </aside>

          {/* Правая колонка — заголовок статьи + текст */}
          <div className="md:col-span-8">
            <p className="font-mono uppercase text-[10px] tracking-[0.3em] text-gold mb-2">Передовица</p>
            <h2 className="font-serif text-3xl md:text-4xl leading-tight mb-5 border-b border-ink/20 pb-3">
              {brand.full_name}: «Каждый призывник имеет право на честное медосвидетельствование»
            </h2>

            {brand.brand_about && (
              <p className="font-serif text-base leading-relaxed text-ink-soft md:columns-2 md:gap-6 first-letter:font-serif first-letter:text-6xl first-letter:float-left first-letter:mr-2 first-letter:leading-[0.85] first-letter:font-bold">
                {brand.brand_about}
              </p>
            )}

            <a
              href={ENTER_PATH(brand.slug)}
              className="mt-7 inline-flex items-center gap-2 px-5 py-3 bg-ink text-paper font-mono text-xs uppercase tracking-[0.25em] hover:bg-gold hover:text-ink transition-colors"
            >
              → войти в личный кабинет
            </a>
          </div>
        </article>

        {/* Раздел «Справка» — три заметки в три колонки с разделителями */}
        <section className="border-t-4 border-double border-ink pt-8">
          <div className="text-center mb-7">
            <p className="font-mono uppercase text-[10px] tracking-[0.3em] text-gold">§ Справка читателю</p>
            <h3 className="font-serif text-2xl mt-1">Три факта, которые следует знать</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-ink/15">
            {LEGAL_FACTS.map((f, i) => (
              <div key={i} className={`${i === 0 ? "" : "pt-6 md:pt-0"} md:px-5`}>
                <p className="font-mono uppercase text-[9px] tracking-[0.3em] text-gold mb-2">
                  Факт № {i + 1}
                </p>
                <h4 className="font-serif text-lg mb-2 leading-snug">{f.title}</h4>
                <p className="font-serif text-sm leading-relaxed text-ink-soft">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink/30 mt-10">
        <div className="container mx-auto px-6 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink/50 flex justify-between">
          <span>nepriziv.ru / u / {brand.slug}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ШАБЛОН 3: MINIMAL — современный tech-минимал
// Gradient mesh фон, асимметричный layout, крупная типографика, glassmorphism.
// ═══════════════════════════════════════════════════════════════════════════

const MinimalTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#0070F3";

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white overflow-hidden relative">
      {/* Gradient mesh — два больших размытых пятна на фоне */}
      <div
        className="absolute top-0 -left-32 w-[500px] h-[500px] rounded-full blur-[120px] opacity-40 pointer-events-none"
        style={{ background: accent }}
      />
      <div
        className="absolute bottom-0 -right-32 w-[600px] h-[600px] rounded-full blur-[140px] opacity-20 pointer-events-none"
        style={{ background: "#FF00AA" }}
      />

      {/* Сетка-фон (subtle grid) */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Топ-бар */}
      <header className="relative z-10 border-b border-white/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/60">принимаю заявки</span>
          </div>
          <span className="font-mono text-white/40 lowercase">/{brand.slug}</span>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-6 pt-16 pb-12 max-w-6xl">
        {/* Hero — асимметрия 7/5 */}
        <section className="grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            {brand.brand_subtitle && (
              <p className="text-sm font-mono uppercase tracking-[0.2em] mb-5" style={{ color: accent }}>
                ◆ {brand.brand_subtitle}
              </p>
            )}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[0.95] tracking-tight">
              {brand.full_name}
              <span style={{ color: accent }}>.</span>
            </h1>

            {brand.brand_about && (
              <p className="text-lg text-white/70 leading-relaxed mt-7 max-w-xl">
                {brand.brand_about}
              </p>
            )}

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={ENTER_PATH(brand.slug)}
                className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-medium transition-transform hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
                  boxShadow: `0 10px 40px -10px ${accent}AA`,
                }}
              >
                Личный кабинет
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              {c.telegram && (
                <button
                  onClick={c.telegram}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-medium border border-white/20 hover:bg-white/10 transition-colors"
                >
                  <Send className="h-4 w-4" /> Telegram
                </button>
              )}
            </div>
          </div>

          {/* Правая колонка — карточка-glassmorphism с аватаром и быстрыми контактами */}
          <div className="md:col-span-5">
            <div className="bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
              {brand.photo_url ? (
                <img
                  src={brand.photo_url}
                  alt=""
                  className="w-full aspect-square object-cover rounded-2xl"
                />
              ) : (
                <BrandedAvatar
                  src=""
                  name={brand.full_name || "Юрист"}
                  shape="square"
                  className="w-full aspect-square rounded-2xl"
                />
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                {c.phone    && <MinimalContactChip icon={Phone}         label="Звонок"   onClick={c.phone} />}
                {c.telegram && <MinimalContactChip icon={Send}          label="Telegram" onClick={c.telegram} />}
                {c.whatsapp && <MinimalContactChip icon={MessageCircle} label="WhatsApp" onClick={c.whatsapp} />}
                {c.email    && <MinimalContactChip icon={Mail}          label="Email"    onClick={c.email} />}
              </div>
            </div>
          </div>
        </section>

        {/* «Закон.факт» — техно-стиль: моноширинный заголовок, 3 минималистичные карточки */}
        <section className="mt-24">
          <div className="flex items-center gap-4 mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em]" style={{ color: accent }}>
              [ 00 ] legal_facts
            </p>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {LEGAL_FACTS.map((f, i) => (
              <div
                key={i}
                className="group bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${accent}22`, color: accent }}
                  >
                    <f.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[10px] text-white/40">
                    0{i + 1}/03
                  </span>
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-white/40 mt-5 max-w-xl">
            Общая правовая справка. Личный разбор вашего случая — в кабинете или по контактам.
          </p>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 mt-12">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between text-xs text-white/40">
          <span>nepriziv.ru</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
};

const MinimalContactChip = ({
  icon: Icon, label, onClick,
}: { icon: any; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/80 transition-colors"
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);

export default LawyerLandingPage;
