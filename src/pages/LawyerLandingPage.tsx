import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BrandedAvatar from "@/components/BrandedAvatar";
import {
  Phone, Send, MessageCircle, Mail, CheckCircle2, ArrowRight, Shield, Award,
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
 * НЕ копия основного сайта — отдельный одностраничник, который:
 *  · показывает только данные юриста (бренд, контакты, оффер)
 *  · ведёт на регистрацию/логин клиента в его (юриста) кабинете
 *  · рендерится в одном из 3-х шаблонов: classic / editorial / minimal
 *
 * Шаблон визуала юрист выбирает в /lawyer/branding (колонка brand_template).
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

// ── ШАБЛОН 1: CLASSIC — карточка-визитка ─────────────────────────────────────

const ClassicTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#C9A24A";

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-stone-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full bg-white shadow-2xl rounded-3xl overflow-hidden">
        {/* Top — аватар + имя */}
        <div className="px-8 pt-10 pb-6 text-center" style={{ background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <BrandedAvatar
            src={brand.photo_url || ""}
            name={brand.full_name || "Юрист"}
            shape="round"
            className="h-28 w-28 mx-auto border-4 border-white shadow-lg"
          />
          <h1 className="text-3xl font-bold mt-5 text-stone-900">{brand.full_name}</h1>
          {brand.brand_subtitle && (
            <p className="text-sm uppercase tracking-[0.2em] mt-2" style={{ color: accent }}>
              {brand.brand_subtitle}
            </p>
          )}
        </div>

        {/* О себе */}
        {brand.brand_about && (
          <div className="px-8 py-6 border-t border-stone-100">
            <p className="text-stone-700 leading-relaxed text-center">{brand.brand_about}</p>
          </div>
        )}

        {/* Преимущества */}
        <div className="px-8 py-6 grid grid-cols-3 gap-3 border-t border-stone-100">
          {[
            { icon: Shield, label: "Опыт по 53-ФЗ" },
            { icon: Award, label: "Военно-врачебная экспертиза" },
            { icon: CheckCircle2, label: "Сопровождение под ключ" },
          ].map((it) => (
            <div key={it.label} className="text-center">
              <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2"
                   style={{ background: `${accent}22`, color: accent }}>
                <it.icon className="h-5 w-5" />
              </div>
              <p className="text-xs text-stone-600 leading-tight">{it.label}</p>
            </div>
          ))}
        </div>

        {/* Контакты */}
        <div className="px-8 py-6 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {c.phone    && <ContactPill icon={Phone}         label="Звонок"     onClick={c.phone}    color={accent} />}
          {c.telegram && <ContactPill icon={Send}          label="Telegram"   onClick={c.telegram} color={accent} />}
          {c.whatsapp && <ContactPill icon={MessageCircle} label="WhatsApp"   onClick={c.whatsapp} color={accent} />}
          {c.email    && <ContactPill icon={Mail}          label="Email"      onClick={c.email}    color={accent} />}
        </div>

        {/* CTA — личный кабинет */}
        <div className="px-8 py-6 bg-stone-900 text-white">
          <p className="text-sm text-stone-300 mb-3 text-center">
            Личный кабинет с ИИ-помощником и анализом ваших медицинских документов
          </p>
          <a
            href={ENTER_PATH(brand.slug)}
            className="block w-full text-center font-semibold py-3 rounded-xl transition-opacity hover:opacity-90"
            style={{ background: accent, color: "#1c1917" }}
          >
            Войти / Зарегистрироваться <ArrowRight className="inline h-4 w-4 ml-1" />
          </a>
        </div>
      </div>
    </div>
  );
};

const ContactPill = ({ icon: Icon, label, onClick, color }: any) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-stone-200 hover:border-current transition-colors"
    style={{ color }}
  >
    <Icon className="h-5 w-5" />
    <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
  </button>
);

// ── ШАБЛОН 2: EDITORIAL — газетный стиль ─────────────────────────────────────

const EditorialTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Хедер-плашка с датой */}
      <div className="container mx-auto px-6 pt-10 pb-4">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-ink/60 border-b border-ink/15 pb-3 flex justify-between">
          <span>Личное представительство</span>
          <span>nepriziv.ru / u / {brand.slug}</span>
        </div>
      </div>

      {/* Основной разворот */}
      <main className="container mx-auto px-6 pb-16 flex-1 grid md:grid-cols-12 gap-10">
        {/* Левая колонка — портрет + контакты */}
        <aside className="md:col-span-4 space-y-6">
          <div className="aspect-[3/4] border border-ink/15 overflow-hidden bg-paper-deep/20 relative">
            {brand.photo_url ? (
              <img src={brand.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <BrandedAvatar
                src=""
                name={brand.full_name || "Юрист"}
                shape="square"
                className="h-full w-full"
              />
            )}
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-gold" aria-hidden />
          </div>

          <div className="space-y-2 text-sm">
            {c.phone && (
              <button onClick={c.phone} className="w-full text-left flex items-center gap-2 text-ink hover:text-gold transition-colors py-1 border-b border-ink/10">
                <Phone className="h-3.5 w-3.5 text-gold" /> {brand.brand_phone}
              </button>
            )}
            {c.telegram && (
              <button onClick={c.telegram} className="w-full text-left flex items-center gap-2 text-ink hover:text-gold transition-colors py-1 border-b border-ink/10">
                <Send className="h-3.5 w-3.5 text-gold" /> Telegram
              </button>
            )}
            {c.whatsapp && (
              <button onClick={c.whatsapp} className="w-full text-left flex items-center gap-2 text-ink hover:text-gold transition-colors py-1 border-b border-ink/10">
                <MessageCircle className="h-3.5 w-3.5 text-gold" /> WhatsApp
              </button>
            )}
            {c.email && (
              <button onClick={c.email} className="w-full text-left flex items-center gap-2 text-ink hover:text-gold transition-colors py-1 border-b border-ink/10">
                <Mail className="h-3.5 w-3.5 text-gold" /> {brand.brand_email}
              </button>
            )}
          </div>
        </aside>

        {/* Правая колонка — главная статья */}
        <article className="md:col-span-8">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-gold mb-3">
            {brand.brand_subtitle || "Юрист по призывному и медицинскому праву"}
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] text-ink mb-6">
            {brand.full_name}
          </h1>
          <div className="h-px bg-ink/15 my-6 max-w-md" />

          <p className="font-serif text-xl leading-relaxed text-ink-soft mb-6 first-letter:font-bold first-letter:text-5xl first-letter:float-left first-letter:mr-2 first-letter:leading-none">
            {brand.brand_about || "Помогаю призывникам реализовать право на освобождение от службы по состоянию здоровья. Веду дело от первого звонка до получения военного билета."}
          </p>

          <div className="grid grid-cols-2 gap-6 my-10 pt-6 border-t border-ink/15">
            {[
              "Анализ медицинских документов",
              "Сопровождение в военкомате",
              "Жалобы и судебное обжалование",
              "Военно-врачебная экспертиза",
            ].map((s) => (
              <div key={s} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                <p className="text-sm text-ink-soft">{s}</p>
              </div>
            ))}
          </div>

          <a
            href={ENTER_PATH(brand.slug)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-paper font-mono text-xs uppercase tracking-[0.2em] hover:bg-gold hover:text-ink transition-colors"
          >
            Личный кабинет клиента <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </article>
      </main>

      <footer className="border-t border-ink/15">
        <div className="container mx-auto px-6 py-4 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50 text-center">
          На платформе nepriziv.ru · © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};

// ── ШАБЛОН 3: MINIMAL — современный минимал ─────────────────────────────────

const MinimalTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#000000";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full">
          {/* Avatar */}
          <BrandedAvatar
            src={brand.photo_url || ""}
            name={brand.full_name || "Юрист"}
            shape="round"
            className="h-20 w-20 mb-10"
          />

          {/* Имя — мега-типография */}
          <h1 className="text-5xl md:text-7xl font-bold text-black leading-[0.95] mb-4 tracking-tight">
            {brand.full_name}.
          </h1>
          {brand.brand_subtitle && (
            <p className="text-xl text-stone-500 mb-10">{brand.brand_subtitle}</p>
          )}

          {/* О себе */}
          {brand.brand_about && (
            <p className="text-lg text-stone-700 leading-relaxed max-w-2xl mb-12">
              {brand.brand_about}
            </p>
          )}

          {/* CTA крупная */}
          <a
            href={ENTER_PATH(brand.slug)}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-white font-semibold text-lg transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            Личный кабинет <ArrowRight className="h-5 w-5" />
          </a>

          {/* Контакты — мелким снизу */}
          <div className="mt-16 pt-8 border-t border-stone-200 flex flex-wrap gap-x-8 gap-y-3 text-sm text-stone-600">
            {c.phone    && <button onClick={c.phone}    className="flex items-center gap-1.5 hover:text-black"><Phone className="h-3.5 w-3.5" />{brand.brand_phone}</button>}
            {c.telegram && <button onClick={c.telegram} className="flex items-center gap-1.5 hover:text-black"><Send className="h-3.5 w-3.5" />Telegram</button>}
            {c.whatsapp && <button onClick={c.whatsapp} className="flex items-center gap-1.5 hover:text-black"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</button>}
            {c.email    && <button onClick={c.email}    className="flex items-center gap-1.5 hover:text-black"><Mail className="h-3.5 w-3.5" />{brand.brand_email}</button>}
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 text-xs text-stone-400 text-center">
        nepriziv.ru / {brand.slug} · © {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default LawyerLandingPage;
