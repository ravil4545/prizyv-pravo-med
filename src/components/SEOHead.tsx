import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBranding } from '@/contexts/BrandingContext';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonical?: string;
}

const DEFAULT_TITLE =
  "Важанина Александра — юрист по призывным делам | nepriziv.ru";
const DEFAULT_DESCRIPTION =
  "Дипломированный юрист Важанина Александра Евгеньевна. 10+ лет защиты призывников: отсрочка, освобождение, военный билет. Первая консультация бесплатно. Работаю по всей РФ.";
const DEFAULT_KEYWORDS =
  "юрист по призыву, юрист призывникам, Важанина Александра, военкомат, освобождение от армии, отсрочка от армии, военный билет, расписание болезней, помощь призывнику, юрист по военным делам, призывная комиссия";

const buildStructuredData = (url: string) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LegalService",
      "@id": `${url}#service`,
      name: "Александра Важанина — юрист по призывным делам",
      description:
        "Юридическая помощь призывникам: отсрочка, освобождение, военный билет. Анализ медицинских документов и судебная защита.",
      url,
      areaServed: "RU",
      availableLanguage: "ru",
      priceRange: "₽₽",
      telephone: "+79253500533",
      provider: { "@id": `${url}#person` },
    },
    {
      "@type": "Person",
      "@id": `${url}#person`,
      name: "Важанина Александра Евгеньевна",
      jobTitle: "Юрист",
      description:
        "Дипломированный юрист с опытом 10+ лет. Специализация — призывное и медицинское право.",
      url,
      image: `${url}lawyer-portrait.jpg`,
      knowsAbout: [
        "Призывное право",
        "Военное право",
        "Расписание болезней",
        "Судебная защита призывников",
      ],
      worksFor: { "@id": `${url}#service` },
    },
    {
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: "nepriziv.ru",
      inLanguage: "ru-RU",
      publisher: { "@id": `${url}#person` },
    },
  ],
});

const SEOHead = ({
  title,
  description,
  keywords = DEFAULT_KEYWORDS,
  ogImage = "https://nepriziv.ru/og-image.png",
  canonical,
}: SEOHeadProps) => {
  const location = useLocation();
  const branding = useBranding();
  const baseUrl = "https://nepriziv.ru";
  const fullUrl = `${baseUrl}${location.pathname}`;
  const canonicalUrl = canonical || fullUrl;

  // В branded режиме title/description генерируются из данных юриста, если
  // вызывающая сторона не передала свои.
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
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: effectiveTitle },
      { property: 'og:description', content: effectiveDescription },
      { property: 'og:url', content: fullUrl },
      { property: 'og:image', content: ogImage },
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

    // Structured data (replace previous block to keep page-specific)
    const SCHEMA_ID = 'page-structured-data';
    let schemaEl = document.getElementById(SCHEMA_ID) as HTMLScriptElement | null;
    if (!schemaEl) {
      schemaEl = document.createElement('script');
      schemaEl.id = SCHEMA_ID;
      schemaEl.type = 'application/ld+json';
      document.head.appendChild(schemaEl);
    }
    schemaEl.textContent = JSON.stringify(buildStructuredData(`${baseUrl}/`));
  }, [effectiveTitle, effectiveDescription, keywords, ogImage, fullUrl, canonicalUrl, branding.displayName, branding.isBranded]);

  return null;
};

export default SEOHead;
