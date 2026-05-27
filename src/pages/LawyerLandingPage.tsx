import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BrandedAvatar from "@/components/BrandedAvatar";
import { Phone, Send, MessageCircle, Mail, ArrowRight } from "lucide-react";

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
 * Подчёркнуто простая визитка — НЕ копия основного сайта.
 * Только: имя/фото юриста, короткое «о себе», контакты, одна CTA в кабинет.
 *
 * 3 шаблона визуала: classic / editorial / minimal — выбирается в /lawyer/branding.
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

// Маленькая ссылка контакта — единый стиль для всех шаблонов
const ContactLink = ({
  icon: Icon, label, onClick, accent,
}: { icon: any; label: string; onClick: () => void; accent?: string }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
    style={accent ? { color: accent } : undefined}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

// ── ШАБЛОН 1: CLASSIC — карточка-визитка ─────────────────────────────────────
// Одна карточка по центру экрана: фото, имя, 1 строка о себе, контакты, кнопка.

const ClassicTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#C9A24A";

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <BrandedAvatar
          src={brand.photo_url || ""}
          name={brand.full_name || "Юрист"}
          shape="round"
          className="h-24 w-24 mx-auto"
        />
        <h1 className="text-2xl font-semibold mt-5 text-stone-900">{brand.full_name}</h1>
        {brand.brand_subtitle && (
          <p className="text-xs uppercase tracking-widest mt-1.5" style={{ color: accent }}>
            {brand.brand_subtitle}
          </p>
        )}

        {brand.brand_about && (
          <p className="text-sm text-stone-600 leading-relaxed mt-5">
            {brand.brand_about}
          </p>
        )}

        <a
          href={ENTER_PATH(brand.slug)}
          className="mt-7 inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium transition-opacity hover:opacity-90"
          style={{ background: accent, color: "#1c1917" }}
        >
          Личный кабинет <ArrowRight className="h-4 w-4" />
        </a>

        {(c.phone || c.telegram || c.whatsapp || c.email) && (
          <div className="mt-5 pt-5 border-t border-stone-100 flex flex-wrap justify-center gap-x-4 gap-y-2 text-stone-600">
            {c.phone    && <ContactLink icon={Phone}         label="Звонок"   onClick={c.phone} />}
            {c.telegram && <ContactLink icon={Send}          label="Telegram" onClick={c.telegram} />}
            {c.whatsapp && <ContactLink icon={MessageCircle} label="WhatsApp" onClick={c.whatsapp} />}
            {c.email    && <ContactLink icon={Mail}          label="Email"    onClick={c.email} />}
          </div>
        )}
      </div>
    </div>
  );
};

// ── ШАБЛОН 2: EDITORIAL — газетный стиль ─────────────────────────────────────
// Серьёзная типография: большое имя, 1 параграф, контакты, кнопка. Без сетки услуг.

const EditorialTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <main className="flex-1 container mx-auto px-6 py-16 max-w-2xl">
        {brand.brand_subtitle && (
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-gold mb-4">
            {brand.brand_subtitle}
          </p>
        )}
        <h1 className="font-serif text-4xl md:text-5xl leading-tight text-ink mb-6">
          {brand.full_name}
        </h1>

        {brand.photo_url && (
          <img
            src={brand.photo_url}
            alt=""
            className="w-32 h-32 object-cover rounded-sm border border-ink/15 mb-6"
          />
        )}

        {brand.brand_about && (
          <p className="font-serif text-lg leading-relaxed text-ink-soft mb-8">
            {brand.brand_about}
          </p>
        )}

        <a
          href={ENTER_PATH(brand.slug)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-paper font-mono text-xs uppercase tracking-[0.2em] hover:bg-gold hover:text-ink transition-colors"
        >
          Личный кабинет <ArrowRight className="h-3.5 w-3.5" />
        </a>

        {(c.phone || c.telegram || c.whatsapp || c.email) && (
          <div className="mt-10 pt-6 border-t border-ink/15 flex flex-wrap gap-x-5 gap-y-2 text-ink-soft">
            {c.phone    && <ContactLink icon={Phone}         label={brand.brand_phone || "Звонок"} onClick={c.phone} />}
            {c.telegram && <ContactLink icon={Send}          label="Telegram"   onClick={c.telegram} />}
            {c.whatsapp && <ContactLink icon={MessageCircle} label="WhatsApp"   onClick={c.whatsapp} />}
            {c.email    && <ContactLink icon={Mail}          label={brand.brand_email || "Email"}   onClick={c.email} />}
          </div>
        )}
      </main>

      <footer className="border-t border-ink/15">
        <div className="container mx-auto px-6 py-3 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50 text-center">
          nepriziv.ru / u / {brand.slug}
        </div>
      </footer>
    </div>
  );
};

// ── ШАБЛОН 3: MINIMAL — современный минимал ─────────────────────────────────
// Голый минимал: большое имя, 1 кнопка, контакты мелочью внизу.

const MinimalTemplate = ({ brand }: { brand: LawyerBrand }) => {
  const c = buildContacts(brand);
  const accent = brand.accent_color || "#000000";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex items-center px-6 py-16">
        <div className="max-w-xl w-full mx-auto">
          {brand.photo_url ? (
            <img
              src={brand.photo_url}
              alt=""
              className="h-16 w-16 rounded-full object-cover mb-8"
            />
          ) : (
            <BrandedAvatar
              src=""
              name={brand.full_name || "Юрист"}
              shape="round"
              className="h-16 w-16 mb-8"
            />
          )}

          <h1 className="text-4xl md:text-5xl font-bold text-black leading-[1] mb-3 tracking-tight">
            {brand.full_name}.
          </h1>
          {brand.brand_subtitle && (
            <p className="text-base text-stone-500 mb-6">{brand.brand_subtitle}</p>
          )}

          {brand.brand_about && (
            <p className="text-base text-stone-700 leading-relaxed mb-10">
              {brand.brand_about}
            </p>
          )}

          <a
            href={ENTER_PATH(brand.slug)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-medium transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            Личный кабинет <ArrowRight className="h-4 w-4" />
          </a>

          {(c.phone || c.telegram || c.whatsapp || c.email) && (
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-stone-600">
              {c.phone    && <ContactLink icon={Phone}         label={brand.brand_phone || "Звонок"} onClick={c.phone} />}
              {c.telegram && <ContactLink icon={Send}          label="Telegram" onClick={c.telegram} />}
              {c.whatsapp && <ContactLink icon={MessageCircle} label="WhatsApp" onClick={c.whatsapp} />}
              {c.email    && <ContactLink icon={Mail}          label={brand.brand_email || "Email"} onClick={c.email} />}
            </div>
          )}
        </div>
      </main>

      <footer className="px-6 py-3 text-xs text-stone-400 text-center">
        nepriziv.ru / {brand.slug}
      </footer>
    </div>
  );
};

export default LawyerLandingPage;
