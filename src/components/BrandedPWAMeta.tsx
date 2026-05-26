import { useEffect } from "react";
import { useBranding } from "@/contexts/BrandingContext";

/**
 * Подменяет PWA-метаданные документа под текущий бренд:
 * - `<link rel="manifest">` указывает на blob:JSON, где name/short_name/theme_color
 *   соответствуют активному юристу. Когда клиент через мобильный браузер делает
 *   «Добавить на главный экран», иконка и название берутся из этого манифеста.
 * - `<meta name="theme-color">` обновляется на акцентный цвет бренда.
 * - `<link rel="apple-touch-icon">` подменяется на фото юриста.
 *
 * Это не полноценный PWA (нет service worker), но даёт «эффект приложения»
 * на iOS/Android: иконка с фото юриста, его имя под иконкой, его цвет
 * в системной плашке.
 */

const setMeta = (name: string, content: string) => {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
};

const setLink = (rel: string, href: string) => {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  return el;
};

const BrandedPWAMeta = () => {
  const branding = useBranding();

  useEffect(() => {
    if (branding.loading) return;

    const themeColor = "#0d1b2a"; // ink — общий тон бренда

    setMeta("theme-color", themeColor);
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    setMeta("apple-mobile-web-app-title", branding.displayName.split(/\s+/)[0] || "Юрист");

    // apple-touch-icon — иконка для iOS Home Screen
    if (branding.photoUrl) {
      setLink("apple-touch-icon", branding.photoUrl);
    }

    // Динамический manifest как blob URL.
    // Иконки добавляем только если есть фото — иначе manifest без icons,
    // браузер использует apple-touch-icon / favicon.
    const icons = branding.photoUrl
      ? [
          { src: branding.photoUrl, sizes: "192x192", type: "image/jpeg", purpose: "any" },
          { src: branding.photoUrl, sizes: "512x512", type: "image/jpeg", purpose: "any" },
        ]
      : [];

    const manifest = {
      name: branding.isBranded ? branding.displayName : "nepriziv.ru — юрист по призыву",
      short_name: branding.displayName.split(/\s+/)[0] || "Юрист",
      description: branding.about,
      start_url: branding.routePrefix || "/",
      scope: branding.routePrefix || "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f4ecdd",
      theme_color: themeColor,
      ...(icons.length ? { icons } : {}),
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    setLink("manifest", url);

    // ВАЖНО: НЕ revoke URL в cleanup. Браузер читает manifest асинхронно;
    // если revoke до чтения — рендерятся артефакты иконок/имени. Blob
    // живёт пока вкладка не закрыта (~1KB на manifest, не критично).
  }, [
    branding.loading,
    branding.isBranded,
    branding.displayName,
    branding.photoUrl,
    branding.about,
    branding.routePrefix,
  ]);

  return null;
};

export default BrandedPWAMeta;
