import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBranding } from '@/contexts/BrandingContext';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS } from '@/lib/seoMeta';

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonical?: string;
  /** Хлебные крошки для BreadcrumbList JSON-LD — рендерим только если переданы. */
  breadcrumbs?: BreadcrumbItem[];
  /** noindex для приватных страниц (кабинет, чаты, профиль). */
  noindex?: boolean;
}

// Дефолты вынесены в src/lib/seoMeta.ts (общий источник правды с prerender).

const buildStructuredData = (
  url: string,
  breadcrumbs?: BreadcrumbItem[],
) => {
  const graph: unknown[] = [
    {
      "@type": "LegalService",
      "@id": `${url}#service`,
      name: "Александра Важанина — юрист по призывным делам",
      description:
        "Юридическая помощь призывникам: анализ медицинских документов, сопоставление с Расписанием болезней, обжалование решений призывной комиссии и судебная защита.",
      url,
      areaServed: { "@type": "Country", name: "Россия" },
      availableLanguage: "ru",
      priceRange: "₽₽",
      paymentAccepted: ["Cash", "Credit Card", "Bank Transfer"],
      currenciesAccepted: "RUB",
      telephone: "+79253500533",
      email: "dompc9@gmail.com",
      provider: { "@id": `${url}#person` },
    },
    {
      "@type": "Person",
      "@id": `${url}#person`,
      name: "Важанина Александра Евгеньевна",
      jobTitle: "Юрист по призывному и медицинскому праву",
      description:
        "Дипломированный юрист с опытом 10+ лет. Специализация — призывное и медицинское право.",
      url,
      image: `${url}lawyer-portrait.jpg`,
      telephone: "+79253500533",
      knowsAbout: [
        "Призывное право",
        "Военное право",
        "Постановление №565",
        "Расписание болезней",
        "Военно-врачебная экспертиза",
        "Судебная защита призывников",
        "КАС РФ",
      ],
      worksFor: { "@id": `${url}#service` },
      sameAs: [
        "https://t.me/nepriziv2",
        "https://wa.me/79253500533",
      ],
    },
    {
      "@type": "Organization",
      "@id": `${url}#organization`,
      name: "nepriziv.ru",
      url,
      logo: `${url}lawyer-portrait.jpg`,
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+79253500533",
        contactType: "customer service",
        availableLanguage: "ru",
        areaServed: "RU",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: "nepriziv.ru",
      inLanguage: "ru-RU",
      publisher: { "@id": `${url}#organization` },
    },
  ];

  if (breadcrumbs && breadcrumbs.length > 0) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: b.url,
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
};

const normalizeUrl = (url: string): string => {
  // Убираем trailing slash (кроме корня), нижний регистр, удаляем фрагмент и query-параметры.
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let path = u.pathname.toLowerCase();
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    u.pathname = path;
    return u.toString();
  } catch {
    return url;
  }
};

const SEOHead = ({
  title,
  description,
  keywords = DEFAULT_KEYWORDS,
  ogImage = "https://nepriziv.ru/og-image.png",
  canonical,
  breadcrumbs,
  noindex = false,
}: SEOHeadProps) => {
  const location = useLocation();
  const branding = useBranding();
  const baseUrl = "https://nepriziv.ru";
  const fullUrl = `${baseUrl}${location.pathname}`;
  const canonicalUrl = normalizeUrl(canonical || fullUrl);

  const effectiveTitle = title
    || (branding.isBranded
      ? `${branding.displayName} · ${branding.subtitle}`
      : DEFAULT_TITLE);
  const effectiveDescription = description
    || (branding.isBranded ? branding.about : DEFAULT_DESCRIPTION);

  useEffect(() => {
    document.title = effectiveTitle;

    const metaTags = [
      { name: 'description', content: effectiveDescription },
      { name: 'keywords', content: keywords },
      { name: 'author', content: branding.displayName },
      { name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: effectiveTitle },
      { property: 'og:description', content: effectiveDescription },
      { property: 'og:url', content: canonicalUrl },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:site_name', content: branding.isBranded ? branding.displayName : 'nepriziv.ru' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: effectiveTitle },
      { name: 'twitter:description', content: effectiveDescription },
      { name: 'twitter:image', content: ogImage },
    ];

    metaTags.forEach(({ name, property, content }) => {
      const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
      let meta = document.querySelector(selector);

      if (!meta) {
        meta = document.createElement('meta');
        if (name) meta.setAttribute('name', name);
        if (property) meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }

      meta.setAttribute('content', content);
    });

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalUrl);

    // Structured data — page-specific, заменяет предыдущий блок.
    const SCHEMA_ID = 'page-structured-data';
    let schemaEl = document.getElementById(SCHEMA_ID) as HTMLScriptElement | null;
    if (!schemaEl) {
      schemaEl = document.createElement('script');
      schemaEl.id = SCHEMA_ID;
      schemaEl.type = 'application/ld+json';
      document.head.appendChild(schemaEl);
    }
    schemaEl.textContent = JSON.stringify(buildStructuredData(`${baseUrl}/`, breadcrumbs));
  }, [
    effectiveTitle,
    effectiveDescription,
    keywords,
    ogImage,
    canonicalUrl,
    branding.displayName,
    branding.isBranded,
    noindex,
    breadcrumbs,
  ]);

  return null;
};

export default SEOHead;
