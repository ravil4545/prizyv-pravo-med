// Единый источник правды по SEO-мете страниц.
//
// Используется ДВАЖДЫ и обязан давать ОДИНАКОВЫЙ результат в обоих местах:
//  1) в рантайме — компоненты страниц передают это в <SEOHead/> (клиентский <head>);
//  2) на сборке — vite-plugin-seo-prerender читает те же билдеры и впекает
//     корректные title/canonical/og/JSON-LD в ИСХОДНЫЙ HTML каждой важной
//     страницы (dist/<route>/index.html). Без этого SPA отдаёт всем краулерам
//     и соцсетям общий title и canonical на главную (см. SEOHead — он правит
//     <head> только в useEffect, т.е. уже ПОСЛЕ загрузки JS).
//
// Модуль ДОЛЖЕН оставаться «чистым» (никаких браузерных/Node-API на верхнем
// уровне), т.к. его статически импортит и Vite-конфиг при сборке.

import { blogExcerpt, normalizeBlogCategory, normalizeBlogTitle } from "./blogPresentation";
import { makeCommissariatSlug } from "./slug";
import type { DiagnosisGuide, GuideFaq } from "../content/diagnosisGuides";

export const BASE_URL = "https://nepriziv.ru";
export const DEFAULT_OG_IMAGE = "https://nepriziv.ru/og-image.png";

export const DEFAULT_TITLE =
  "Юрист по призыву · анализ медицинских документов и защита прав — nepriziv.ru";
export const DEFAULT_DESCRIPTION =
  "Юрист Важанина А.Е. — юридический анализ медицинских документов, сопоставление с Расписанием болезней (Пост. №565), сопровождение на призывной комиссии и в суде. Бесплатный разбор за 15 минут.";
export const DEFAULT_KEYWORDS =
  "юрист по призыву, анализ медицинских документов, расписание болезней постановление 565, обжалование решения призывной комиссии, отсрочка от армии, освобождение от призыва по здоровью, независимая военно-врачебная экспертиза, призывная комиссия суд КАС РФ";

export interface PageSeo {
  /** Канонический путь страницы, напр. "/diagnoses/68" (всегда с ведущим "/"). */
  path: string;
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  /** Схема Schema.org для конкретной страницы — впекается в prerender. */
  jsonLd?: unknown;
  /** Заголовок и текст для скрытой crawler-подложки в исходном HTML. */
  h1?: string;
  bodyText?: string;
}

/** Абсолютный canonical URL для пути. */
export const canonicalUrl = (path: string): string => `${BASE_URL}${path}`;

// ─── Диагнозы (статьи Расписания болезней) ──────────────────────────────────
export interface DiagnosisLike {
  title: string;
  description: string;
  article_number: string;
  category?: string | null;
}

/** FAQPage schema из FAQ гайда (rich-результаты Google/Яндекс). */
export function faqJsonLd(faq: GuideFaq[]): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function diagnosisSeo(d: DiagnosisLike, guide?: DiagnosisGuide): PageSeo {
  const path = `/diagnoses/${d.article_number}`;
  const medicalCondition = {
    "@context": "https://schema.org",
    "@type": "MedicalCondition",
    name: d.title,
    description: d.description,
    code: {
      "@type": "MedicalCode",
      codingSystem: "Расписание болезней (Постановление №565)",
      codeValue: d.article_number,
    },
  };

  // С гайдом: богаче meta-description, текст для crawler-подложки и FAQPage schema.
  const description = guide
    ? `Берут ли в армию с ${guide.conditionInstrumental} в 2026 году. ${guide.intro ?? ""} Категория годности по статье ${d.article_number}, нужные документы, ошибки на медкомиссии, FAQ.`
        .replace(/\s+/g, " ")
        .trim()
    : `${d.title}: основания для освобождения от призыва по статье ${d.article_number}. ${d.description.slice(0, 140)}…`;

  return {
    path,
    title: `${d.title} — статья ${d.article_number} Расписания болезней | Юрист Важанина`,
    description,
    keywords: `${d.title}, статья ${d.article_number}, расписание болезней, освобождение от армии, призывник, ${d.category ?? ""}`,
    h1: d.title,
    bodyText: guide
      ? [guide.intro, guide.armyVerdict, guide.categories].filter(Boolean).join("\n\n")
      : d.description,
    jsonLd: guide ? [medicalCondition, faqJsonLd(guide.faq)] : medicalCondition,
  };
}

// ─── Блог ───────────────────────────────────────────────────────────────────
export interface BlogPostLike {
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  category?: string | null;
  image_url?: string | null;
  published_at?: string | null;
  created_at?: string;
}

export function blogSeo(p: BlogPostLike): PageSeo {
  const path = `/blog/${p.slug}`;
  const title = normalizeBlogTitle(p.title);
  const category = normalizeBlogCategory(p.category);
  const description = blogExcerpt(p);
  const dateIso = p.published_at || p.created_at;
  return {
    path,
    title: `${title} | Блог · Александра Важанина`,
    description,
    keywords: `${title}, ${category || "блог"}, призыв, военкомат, юрист`,
    ogImage: p.image_url || undefined,
    h1: title,
    bodyText: description,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description,
      articleSection: category || undefined,
      datePublished: dateIso,
      dateModified: dateIso,
      image: p.image_url || undefined,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl(path) },
      author: { "@type": "Person", name: "Важанина Александра Евгеньевна" },
      publisher: {
        "@type": "Organization",
        name: "nepriziv.ru",
        logo: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE },
      },
    },
  };
}

// ─── Военкоматы (агрегат отзывов по slug) ───────────────────────────────────
export interface CommissariatReviewLike {
  rating: number;
  comment?: string | null;
  created_at: string;
}
export interface CommissariatGroup {
  name: string;
  city: string;
  region?: string | null;
  ratings: CommissariatReviewLike[];
}

export function commissariatSeo(g: CommissariatGroup): PageSeo {
  const slug = makeCommissariatSlug(g.name, g.city);
  const path = `/commissariats/${slug}`;
  const count = g.ratings.length;
  const avg = count ? g.ratings.reduce((s, r) => s + r.rating, 0) / count : 0;
  const locationLabel = g.region ? `${g.city}, ${g.region}` : g.city;
  const withComment = g.ratings.filter((r) => r.comment && r.comment.trim().length > 0);
  return {
    path,
    title: `${g.name} (${g.city}) — отзывы и рейтинг | Юрист по призыву`,
    description: `${g.name} в ${locationLabel}: ${count} отзывов призывников, средняя оценка ${avg.toFixed(1)}/5. Юридическая помощь по призыву — бесплатная вводная.`,
    keywords: `${g.name}, военкомат ${g.city}, отзывы военкомат, рейтинг военкомата, призывник ${g.city}, юрист по призыву ${g.city}`,
    h1: `${g.name} (${locationLabel})`,
    bodyText: withComment.length
      ? withComment.slice(0, 3).map((r) => r.comment!.trim()).join(" ")
      : `Отзывы призывников о военкомате «${g.name}» в ${locationLabel}. Средняя оценка ${avg.toFixed(1)} из 5.`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "GovernmentOffice",
      name: g.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: g.city,
        addressRegion: g.region || undefined,
        addressCountry: "RU",
      },
      aggregateRating: count
        ? {
            "@type": "AggregateRating",
            ratingValue: avg.toFixed(2),
            reviewCount: count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    },
  };
}

// ─── Статические публичные страницы ─────────────────────────────────────────
// ВНИМАНИЕ: значения должны совпадать с <SEOHead/> в соответствующих страницах
// (Services/Templates/Diagnoses/Blog/Commissariats/… ). Главная "/" не нужна —
// её мета уже зашита в index.html.
export const STATIC_SEO: PageSeo[] = [
  {
    path: "/services",
    title: "Услуги юриста по призыву: анализ документов, обжалование, сопровождение",
    description:
      "Четыре формата работы: консультация, юридический анализ медицинских документов по Расписанию болезней, обжалование решения призывной комиссии, сопровождение до итогового решения.",
    h1: "Услуги юриста по призыву",
  },
  {
    path: "/templates",
    title: "Образцы заявлений для военкомата: скачать шаблоны DOCX и PDF",
    description:
      "Готовые шаблоны документов призывника: заявление о выдаче копии решения, обжалование, запросы и ходатайства. Заполните онлайн и скачайте.",
    h1: "Образцы заявлений для военкомата",
  },
  {
    path: "/diagnoses",
    title: "Справочник диагнозов и статей Расписания болезней | Юрист Важанина",
    description:
      "Полный справочник 88 статей Расписания болезней (Постановление №565) с разъяснениями. Подберите подходящую статью для освобождения от призыва.",
    keywords:
      "расписание болезней, статьи 565, непризывные диагнозы, отсрочка от армии, освобождение, категория В, военно-врачебная экспертиза",
    h1: "Справочник диагнозов и статей Расписания болезней",
  },
  {
    path: "/blog",
    title: "Блог · Призыв, медицина и право | Александра Важанина",
    description:
      "Разборы реальных кейсов, изменения в законодательстве о призыве, инструкции для призывников и их родителей от практикующего юриста.",
    keywords:
      "блог призыв, юрист призыв, военкомат блог, отсрочка от армии, военный билет, расписание болезней",
    h1: "Блог о призыве, медицине и праве",
  },
  {
    path: "/commissariats",
    title: "Военкоматы России: адреса, контакты, отзывы — справочник",
    description:
      "Справочник военных комиссариатов: адреса, телефоны, отзывы и оценки призывников. Найдите свой военкомат и изучите опыт других.",
    h1: "Военкоматы России: справочник и отзывы",
  },
  {
    path: "/success-cases",
    title: "Кейсы по призывным делам: примеры и результаты — nepriziv.ru",
    description:
      "Реальные примеры дел призывников: категории годности по статьям Расписания болезней, обжалования решений комиссий, судебная практика.",
    h1: "Кейсы по призывным делам",
  },
  {
    path: "/testimonials",
    title: "Отзывы клиентов о юристе по призыву — nepriziv.ru",
    description:
      "Отзывы призывников и родителей о юридическом сопровождении, анализе медицинских документов и ИИ-кабинете nepriziv.ru.",
    h1: "Отзывы клиентов",
  },
  {
    path: "/forum",
    title: "Форум призывников: вопросы и ответы юриста — nepriziv.ru",
    description:
      "Вопросы о повестках, категориях годности, отсрочках и Расписании болезней. Опыт призывников и ответы юриста.",
    h1: "Форум призывников",
  },
  {
    path: "/lawyers",
    title: "Юристы по призывному праву | Каталог nepriziv.ru",
    description:
      "Дипломированные юристы по призывному и медицинскому праву. Защищённый чат, прозрачные тарифы, опыт ведения дел в военкомате и суде.",
    keywords: "юристы по призыву, каталог юристов, юрист призывнику, призывное право",
    h1: "Каталог юристов по призывному праву",
  },
  {
    path: "/privacy",
    title: "Политика конфиденциальности — nepriziv.ru",
    description:
      "Политика обработки персональных данных на nepriziv.ru. Цели сбора, сроки хранения, права субъекта по 152-ФЗ.",
    h1: "Политика конфиденциальности",
  },
  {
    path: "/terms",
    title: "Пользовательское соглашение — nepriziv.ru",
    description:
      "Условия использования сайта nepriziv.ru: правила работы, ограничения ответственности, авторские права.",
    h1: "Пользовательское соглашение",
  },
  {
    path: "/offer",
    title: "Публичная оферта ИИ-кабинета — nepriziv.ru",
    description: "Условия подписки на ИИ-кабинет nepriziv.ru: тарифы, оплата, возврат, отмена.",
    h1: "Публичная оферта ИИ-кабинета",
  },
  {
    path: "/requisites",
    title: "Реквизиты — nepriziv.ru",
    description: "Юридические и контактные реквизиты nepriziv.ru.",
    h1: "Реквизиты",
  },
];
