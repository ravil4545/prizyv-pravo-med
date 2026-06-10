import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Динамический sitemap: статические разделы + опубликованные посты блога +
// карточки диагнозов (/diagnoses/<article_number>). Подключён в robots.txt
// строкой Sitemap: https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/sitemap
// (кросс-хостовая декларация через robots.txt допустима протоколом sitemaps.org).
// Статический /sitemap.xml остаётся как фолбэк по базовым разделам.

const BASE = "https://nepriziv.ru";

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/services", changefreq: "monthly", priority: "0.9" },
  { path: "/diagnoses", changefreq: "weekly", priority: "0.9" },
  { path: "/commissariats", changefreq: "weekly", priority: "0.8" },
  { path: "/success-cases", changefreq: "monthly", priority: "0.8" },
  { path: "/templates", changefreq: "monthly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/testimonials", changefreq: "weekly", priority: "0.7" },
  { path: "/forum", changefreq: "daily", priority: "0.7" },
  { path: "/dashboard", changefreq: "monthly", priority: "0.5" },
  { path: "/auth", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/offer", changefreq: "yearly", priority: "0.3" },
  { path: "/requisites", changefreq: "yearly", priority: "0.3" },
];

const escXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c
  ));

const urlTag = (loc: string, lastmod?: string, changefreq?: string, priority?: string) =>
  "  <url>\n" +
  `    <loc>${escXml(loc)}</loc>\n` +
  (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
  (changefreq ? `    <changefreq>${changefreq}</changefreq>\n` : "") +
  (priority ? `    <priority>${priority}</priority>\n` : "") +
  "  </url>\n";

serve(async (_req) => {
  let dynamicUrls = "";
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [blogRes, diagRes] = await Promise.all([
      supabase
        .from("blog_posts")
        .select("slug, updated_at, published_at")
        .eq("status", "published")
        .not("slug", "ilike", "http%"),
      supabase
        .from("disease_articles_565")
        .select("article_number, updated_at")
        .or("is_active.is.null,is_active.eq.true"),
    ]);

    for (const p of blogRes.data || []) {
      const lastmod = (p.updated_at || p.published_at || "").slice(0, 10) || undefined;
      dynamicUrls += urlTag(`${BASE}/blog/${p.slug}`, lastmod, "monthly", "0.7");
    }
    for (const d of diagRes.data || []) {
      const lastmod = (d.updated_at || "").slice(0, 10) || undefined;
      dynamicUrls += urlTag(
        `${BASE}/diagnoses/${encodeURIComponent(d.article_number)}`,
        lastmod,
        "monthly",
        "0.7",
      );
    }
  } catch (e) {
    // Fail-open: при сбое БД отдаём хотя бы статические разделы.
    console.error("sitemap dynamic part failed:", e);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    STATIC_ROUTES.map((r) => urlTag(`${BASE}${r.path}`, undefined, r.changefreq, r.priority)).join("") +
    dynamicUrls +
    "</urlset>\n";

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Час кеша — краулерам достаточно, БД не дёргается на каждый визит.
      "Cache-Control": "public, max-age=3600",
    },
  });
});
