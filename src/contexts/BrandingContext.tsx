import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * White-label брендинг.
 *
 * Концепция: каждый юрист платформы получает свою «копию» сайта по адресу
 * /u/<slug>. Клиент, перешедший по такой ссылке (обычно из QR-кода или
 * мессенджера), видит сайт под брендом этого юриста — его ФИО, фото, контакты,
 * акценты — и не подозревает, что под капотом nepriziv.ru.
 *
 * После первого визита по бренд-ссылке slug записывается в sessionStorage,
 * чтобы навигация по сайту сохраняла брендинг даже на нейтральных роутах.
 * При закрытии вкладки бренд исчезает — следующий заход без /u/ снова даёт
 * нейтральный сайт.
 */

export interface Branding {
  /** true если посетитель пришёл на сайт под чьим-то брендом */
  isBranded: boolean;
  /** Slug текущего бренда, если есть */
  slug: string | null;
  /** ID юриста-владельца бренда — нужен для авто-привязки клиентов */
  lawyerUserId: string | null;
  displayName: string;
  subtitle: string;
  about: string;
  photoUrl: string;
  phone: string;
  /** Telegram-username без @ или полный URL */
  telegram: string;
  /** WhatsApp в формате 79253500533 */
  whatsapp: string;
  email: string;
  /** Префикс для маршрутов: "/u/<slug>" в branded, "" в дефолтном */
  routePrefix: string;
  /** Полный URL-вид: nepriziv.ru/u/<slug> */
  publicUrl: string;
  loading: boolean;
}

const DEFAULT_BRANDING: Branding = {
  isBranded: false,
  slug: null,
  lawyerUserId: null,
  displayName: "Важанина Александра Евгеньевна",
  subtitle: "Юрист по призывному и медицинскому праву",
  about:
    "Помогаю призывникам и их семьям законно получить отсрочку, освобождение или военный билет. Работаю на основании договора, соблюдаю конфиденциальность по договору.",
  photoUrl: "/lawyer-portrait.jpg",
  phone: "+7 925 350-05-33",
  telegram: "nepriziv2",
  whatsapp: "79253500533",
  email: "dompc9@gmail.com",
  routePrefix: "",
  publicUrl: "https://nepriziv.ru",
  loading: false,
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

const STORAGE_KEY = "branding:slug";

interface LawyerBrandRow {
  user_id: string;
  slug: string;
  full_name: string | null;
  photo_url: string | null;
  brand_subtitle: string | null;
  brand_about: string | null;
  brand_phone: string | null;
  brand_telegram: string | null;
  brand_whatsapp: string | null;
  brand_email: string | null;
  accent_color: string | null;
  is_active: boolean;
}

const buildBranding = (row: LawyerBrandRow): Branding => ({
  isBranded: true,
  slug: row.slug,
  lawyerUserId: row.user_id,
  displayName: row.full_name?.trim() || "Юрист",
  subtitle: row.brand_subtitle?.trim() || "Юрист по призывному праву",
  about:
    row.brand_about?.trim() ||
    "Помогаю призывникам законно получить отсрочку, освобождение или военный билет.",
  photoUrl: row.photo_url?.trim() || "/lawyer-portrait.jpg",
  phone: row.brand_phone?.trim() || "",
  telegram: (row.brand_telegram || "").replace(/^@/, "").trim(),
  whatsapp: (row.brand_whatsapp || "").replace(/[^\d]/g, ""),
  email: row.brand_email?.trim() || "",
  routePrefix: `/u/${row.slug}`,
  publicUrl: `https://nepriziv.ru/u/${row.slug}`,
  loading: false,
});

/**
 * Извлекает slug из текущего URL вида /u/<slug>/...
 * react-router useParams не работает за пределами Routes, поэтому парсим
 * pathname вручную.
 */
const slugFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/u\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9]?)(?:\/|$)/);
  return match ? match[1] : null;
};

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [state, setState] = useState<Branding>({ ...DEFAULT_BRANDING, loading: true });

  useEffect(() => {
    // Приоритет: явный slug в URL > сохранённый в sessionStorage > дефолт
    const urlSlug = slugFromPath(location.pathname);
    let activeSlug = urlSlug;

    if (!activeSlug && typeof window !== "undefined") {
      try {
        activeSlug = window.sessionStorage.getItem(STORAGE_KEY);
      } catch {}
    }

    if (!activeSlug) {
      setState({ ...DEFAULT_BRANDING, loading: false });
      return;
    }

    // Сохраняем slug в sessionStorage, чтобы branded-режим переживал переходы
    // на /lawyers, /dashboard и т. п.
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, activeSlug);
      } catch {}
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    supabase
      .from("lawyer_profiles")
      .select(
        "user_id, slug, full_name, photo_url, brand_subtitle, brand_about, brand_phone, brand_telegram, brand_whatsapp, brand_email, accent_color, is_active",
      )
      .eq("slug", activeSlug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          // Бренд не найден — чистим storage и переходим к дефолту
          try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
          setState({ ...DEFAULT_BRANDING, loading: false });
          return;
        }
        setState(buildBranding(data as LawyerBrandRow));
      });

    return () => { cancelled = true; };
  }, [location.pathname]);

  return <BrandingContext.Provider value={state}>{children}</BrandingContext.Provider>;
};

export const useBranding = () => useContext(BrandingContext);

/** Сбросить активный бренд (например, юрист вышел в общий каталог) */
export const clearBranding = () => {
  if (typeof window !== "undefined") {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }
};
