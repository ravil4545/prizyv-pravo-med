import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonical?: string;
}

const SEOHead = ({ 
  title = "Юридическая и медицинская помощь призывникам | НеПризыв.ру",
  description = "Профессиональная юридическая и медицинская помощь призывникам. Анализ документов, консультации по освобождению от службы, правовая поддержка. ⭐ Бесплатная консультация!",
  keywords = "призыв, военкомат, освобождение от армии, юридическая помощь призывникам, медицинские освидетельствования, отсрочка от армии, военный билет, консультация призывника",
  ogImage = "https://nepriziv.ru/og-image.png",
  canonical
}: SEOHeadProps) => {
  const location = useLocation();
  const baseUrl = "https://nepriziv.ru";
  const fullUrl = `${baseUrl}${location.pathname}`;
  const canonicalUrl = canonical || fullUrl;

  useEffect(() => {
    // Update document title
    document.title = title;

    // Update meta tags
    const metaTags = [
      { name: 'description', content: description },
      { name: 'keywords', content: keywords },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: fullUrl },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
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

    // Update canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
  }, [title, description, keywords, ogImage, fullUrl, canonicalUrl]);

  return null;
};

export default SEOHead;
