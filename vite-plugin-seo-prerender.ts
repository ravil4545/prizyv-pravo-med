import type { Plugin } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  BASE_URL,
  DEFAULT_KEYWORDS,
  DEFAULT_OG_IMAGE,
  STATIC_SEO,
  diagnosisSeo,
  blogSeo,
  commissariatSeo,
  canonicalUrl,
  type PageSeo,
} from "./src/lib/seoMeta";
import { makeCommissariatSlug } from "./src/lib/slug";
import { getDiagnosisGuide } from "./src/content/diagnosisGuides";

// Публичные ключи (anon) читаются из окружения — тот же источник, что и у
// приложения (@/lib/supabaseConfig). Раньше они были захардкожены здесь, и
// сборка ходила в облако даже после правки .env: страницы работали против
// одного проекта, а пре-рендеренный <head> — против другого.
//
// Значения приезжают из vite.config.ts через loadEnv: Vite НЕ кладёт .env в
// process.env сам, поэтому плагин принимает их параметром, а process.env —
// запасной путь для случая, когда плагин зовут напрямую.
let SUPABASE_URL = "";
let SUPABASE_ANON = "";

const escapeHtml = (s: string): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeAttr = (s: string): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Безопасный JSON-LD внутри <script> — гасим закрывающие теги. */
const jsonLdScript = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/** Заменить значение тега по «голове» (всё до content=") — порядок/пробелы не важны. */
const replaceAttr = (html: string, head: RegExp, value: string): string =>
  html.replace(head, (m) => m.replace(/content="[^"]*"/, `content="${escapeAttr(value)}"`));

function injectSeo(template: string, seo: PageSeo): string {
  const canonical = canonicalUrl(seo.path);
  const ogImage = seo.ogImage || DEFAULT_OG_IMAGE;
  const keywords = seo.keywords || DEFAULT_KEYWORDS;
  let html = template;

  // <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);

  // <meta name="..."> и <meta property="..."> — по идентифицирующему атрибуту.
  html = replaceAttr(html, /<meta name="title"[^>]*>/, seo.title);
  html = replaceAttr(html, /<meta name="description"[^>]*>/, seo.description);
  html = replaceAttr(html, /<meta name="keywords"[^>]*>/, keywords);
  html = replaceAttr(html, /<meta property="og:title"[^>]*>/, seo.title);
  html = replaceAttr(html, /<meta property="og:description"[^>]*>/, seo.description);
  html = replaceAttr(html, /<meta property="og:url"[^>]*>/, canonical);
  html = replaceAttr(html, /<meta property="og:image"[^>]*>/, ogImage);
  html = replaceAttr(html, /<meta name="twitter:title"[^>]*>/, seo.title);
  html = replaceAttr(html, /<meta name="twitter:description"[^>]*>/, seo.description);
  html = replaceAttr(html, /<meta name="twitter:url"[^>]*>/, canonical);
  html = replaceAttr(html, /<meta name="twitter:image"[^>]*>/, ogImage);

  // <link rel="canonical">
  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
  );

  // Schema.org для страницы — перед </head> (может быть массив: MedicalCondition + FAQPage).
  if (seo.jsonLd) {
    const blocks = Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd];
    const scripts = blocks.map((b) => jsonLdScript(b)).join("\n    ");
    html = html.replace("</head>", `    ${scripts}\n  </head>`);
  }

  // Crawler-подложка: настоящий H1 + текст в исходном HTML (Яндекс/соцсети JS не
  // исполняют). Визуально скрыта (clip), а React на mount всё равно заменяет
  // содержимое #root целиком (createRoot().render) — флеша нет.
  if (seo.h1 || seo.bodyText) {
    const block =
      `<div id="prerender-seo" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:normal;border:0">` +
      (seo.h1 ? `<h1>${escapeHtml(seo.h1)}</h1>` : "") +
      (seo.bodyText ? `<p>${escapeHtml(seo.bodyText.slice(0, 2000))}</p>` : "") +
      `</div>`;
    html = html.replace(
      '<div id="root">',
      `<div id="root">\n      ${block}`,
    );
  }

  return html;
}

async function fetchDynamicRoutes(): Promise<PageSeo[]> {
  const routes: PageSeo[] = [];

  // Без адреса и ключа динамику не получить. Сообщаем явно и выходим:
  // молчаливый пропуск выглядел бы как «в базе нет диагнозов», и потеря
  // сотни SEO-страниц заметилась бы только по падению трафика.
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.warn(
      "[seo-prerender] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY не заданы — " +
        "динамические маршруты (диагнозы, блог, военкоматы) пропущены",
    );
    return routes;
  }

  // Динамический импорт — supabase-js грузится только на сборке, не при чтении конфига.
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Диагнозы
  const { data: dx } = await sb
    .from("diagnoses")
    .select("title,description,article_number,category");
  for (const d of dx || []) {
    if (d?.article_number) routes.push(diagnosisSeo(d as any, getDiagnosisGuide(d.article_number)));
  }

  // Блог (только опубликованные)
  const { data: bp } = await sb
    .from("blog_posts")
    .select("title,slug,content,excerpt,category,image_url,published_at,created_at")
    .eq("status", "published");
  for (const p of bp || []) {
    if (p?.slug) routes.push(blogSeo(p as any));
  }

  // Военкоматы — группируем отзывы по slug
  const { data: cr } = await sb
    .from("commissariat_ratings")
    .select("commissariat_name,city,region,rating,comment,created_at");
  const groups = new Map<string, { name: string; city: string; region: string | null; ratings: any[] }>();
  for (const r of (cr as any[]) || []) {
    if (!r?.commissariat_name || !r?.city) continue;
    const slug = makeCommissariatSlug(r.commissariat_name, r.city);
    if (!groups.has(slug)) {
      groups.set(slug, { name: r.commissariat_name, city: r.city, region: r.region ?? null, ratings: [] });
    }
    groups.get(slug)!.ratings.push(r);
  }
  for (const g of groups.values()) {
    routes.push(commissariatSeo(g));
  }

  return routes;
}

/**
 * SEO-prerender: после сборки SPA впекает корректные <head> (+ JSON-LD и
 * скрытую crawler-подложку) в исходный HTML важных публичных страниц, чтобы
 * краулеры и соцсети видели правильные title/canonical/og БЕЗ исполнения JS.
 *
 * Запускается в `vite build` (хук closeBundle) — работает независимо от того,
 * как Lovable запускает сборку. Полностью fail-open: любая ошибка получения
 * динамики только пропускает динамические маршруты, статические пишутся всегда,
 * сборка НИКОГДА не падает.
 */
export interface SeoPrerenderOptions {
  /** Адрес Supabase. Из vite.config.ts через loadEnv. */
  supabaseUrl?: string;
  /** Публичный anon-ключ. */
  supabaseAnonKey?: string;
}

export default function seoPrerender(options: SeoPrerenderOptions = {}): Plugin {
  SUPABASE_URL = (options.supabaseUrl || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  SUPABASE_ANON = options.supabaseAnonKey || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  return {
    name: "seo-prerender",
    apply: "build",
    async closeBundle() {
      const outDir = path.resolve(process.cwd(), "dist");
      const indexPath = path.join(outDir, "index.html");

      let template: string;
      try {
        template = await readFile(indexPath, "utf8");
      } catch {
        this.warn?.("[seo-prerender] dist/index.html не найден — пропуск");
        return;
      }

      const routes: PageSeo[] = [...STATIC_SEO];
      try {
        const dynamic = await fetchDynamicRoutes();
        routes.push(...dynamic);
        console.log(`[seo-prerender] динамических маршрутов получено: ${dynamic.length}`);
      } catch (e) {
        console.warn(
          `[seo-prerender] не удалось получить динамику (пишу только статические): ${
            (e as Error)?.message || e
          }`,
        );
      }

      let written = 0;
      for (const seo of routes) {
        // Безопасность пути: только нормальные сегменты, без обхода и без "/".
        if (!seo.path || seo.path === "/" || seo.path.includes("..")) continue;
        const segments = seo.path.split("/").filter(Boolean);
        if (segments.some((s) => !s || s === "." || s.includes("\\") || s.includes("\0"))) continue;

        const html = injectSeo(template, seo);
        const dir = path.join(outDir, ...segments);
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, "index.html"), html, "utf8");
          written++;
        } catch (e) {
          console.warn(`[seo-prerender] пропуск ${seo.path}: ${(e as Error)?.message || e}`);
        }
      }

      console.log(`[seo-prerender] впечатано страниц: ${written} (из ${routes.length})`);
    },
  };
}
