import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import BlogPostImage from "@/components/BlogPostImage";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Calendar, Clock, ArrowRight, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { calcReadingTimeMin, readingTimeLabel } from "@/lib/blogUtils";
import { blogExcerpt, blogPlainText, normalizeBlogCategory, normalizeBlogTitle } from "@/lib/blogPresentation";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
  image_url: string | null;
}

const BLOG_VISUALS = [
  {
    src: "/blog-visuals/document-check.svg",
    title: "Документы",
    text: "Проверяем повестку, сроки, реквизиты и доказательства вручения.",
  },
  {
    src: "/blog-visuals/medical-evidence.svg",
    title: "Медицина",
    text: "Собираем справки, выписки и обследования в понятную позицию.",
  },
  {
    src: "/blog-visuals/deadline-route.svg",
    title: "Сроки",
    text: "Фиксируем даты, уважительные причины и письменные обращения.",
  },
];

const BlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const activeCategory = searchParams.get("category") || "all";

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts((data || []) as BlogPost[]);
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => {
      const category = normalizeBlogCategory(p.category);
      if (category) set.add(category);
    });
    return Array.from(set).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      const category = normalizeBlogCategory(p.category);
      if (activeCategory !== "all" && category !== activeCategory) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        normalizeBlogTitle(p.title).toLowerCase().includes(q) ||
        blogPlainText(p.excerpt).toLowerCase().includes(q) ||
        blogPlainText(p.content).toLowerCase().includes(q)
      );
    });
  }, [posts, activeCategory, search]);

  const setCategory = (cat: string) => {
    const next = new URLSearchParams(searchParams);
    if (cat === "all") next.delete("category");
    else next.set("category", cat);
    setSearchParams(next, { replace: true });
  };

  const [feature, ...rest] = filtered;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Блог · Призыв, медицина и право | Александра Важанина"
        description="Разборы реальных кейсов, изменения в законодательстве о призыве, инструкции для призывников и их родителей от практикующего юриста."
        keywords="блог призыв, юрист призыв, военкомат блог, отсрочка от армии, военный билет, расписание болезней"
      />
      <Header />
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-10 sm:py-16 pb-24 md:pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <header className="border-b border-ink/15 pb-6 sm:pb-8 mb-8 sm:mb-10">
            <div className="font-mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-gold mb-3">
              № 04 · Журнал
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-3">
              Блог о призыве и праве
            </h1>
            <p className="text-base sm:text-lg text-ink-soft max-w-2xl leading-relaxed">
              Разборы кейсов, изменения в законодательстве и практические инструкции — от практикующего
              юриста с десятилетним стажем.
            </p>
          </header>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10" aria-label="Темы юридического блога">
            {BLOG_VISUALS.map((item) => (
              <div key={item.title} className="grid grid-cols-[88px_1fr] sm:grid-cols-[104px_1fr] items-center gap-4 border border-ink/15 bg-paper/70 p-3 sm:p-4">
                <img
                  src={item.src}
                  alt=""
                  aria-hidden="true"
                  className="h-16 sm:h-20 w-full object-cover border border-ink/10 bg-paper"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <p className="font-serif text-lg leading-tight text-ink">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.text}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Search + categories */}
          <div className="mb-8 sm:mb-10 space-y-4">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по статьям..."
                className="pl-9 h-11 bg-paper border-ink/20 focus-visible:ring-gold"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {categories.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setCategory("all")}
                  className={`px-3 py-1.5 text-xs font-mono tracking-[0.15em] uppercase border transition-colors ${
                    activeCategory === "all"
                      ? "bg-ink text-paper border-ink"
                      : "bg-paper text-ink border-ink/20 hover:border-gold hover:text-gold-deep"
                  }`}
                >
                  Все
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-mono tracking-[0.15em] uppercase border transition-colors ${
                      activeCategory === cat
                        ? "bg-ink text-paper border-ink"
                        : "bg-paper text-ink border-ink/20 hover:border-gold hover:text-gold-deep"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border border-ink/10">
                  <Skeleton className="aspect-video w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 border border-dashed border-ink/20">
              <p className="font-serif text-xl text-ink mb-2">Ничего не найдено</p>
              <p className="text-sm text-ink-soft">
                {search || activeCategory !== "all"
                  ? "Попробуйте другой запрос или категорию"
                  : "Скоро здесь появятся статьи"}
              </p>
            </div>
          )}

          {/* Featured (first post) */}
          {!loading && feature && (
            <Link
              to={`/blog/${feature.slug}`}
              className="group block mb-10 border border-ink/15 hover:border-gold transition-colors"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                  <BlogPostImage
                    src={feature.image_url}
                  alt={normalizeBlogTitle(feature.title)}
                  category={normalizeBlogCategory(feature.category)}
                  aspect="video"
                  className="md:aspect-auto md:h-full"
                />
                <div className="p-6 sm:p-8 flex flex-col justify-center">
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                    Передовица
                  </div>
                  <h2 className="font-serif text-2xl sm:text-3xl text-ink leading-tight mb-3 group-hover:text-gold-deep transition-colors">
                    {normalizeBlogTitle(feature.title)}
                  </h2>
                  <p className="text-ink-soft leading-relaxed mb-5 line-clamp-3">
                    {blogExcerpt(feature)}
                  </p>
                  <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.15em] uppercase text-ink/60 flex-wrap">
                    {normalizeBlogCategory(feature.category) && <span className="text-gold-deep">{normalizeBlogCategory(feature.category)}</span>}
                    {feature.published_at && (
                      <>
                        <span className="text-ink/20">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(feature.published_at), "d MMM yyyy", { locale: ru })}
                        </span>
                      </>
                    )}
                    <span className="text-ink/20">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {readingTimeLabel(calcReadingTimeMin(feature.content))}
                    </span>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-gold-deep font-medium group-hover:gap-2.5 transition-all">
                    Читать полностью <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Grid */}
          {!loading && rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {rest.map((p) => {
                const min = calcReadingTimeMin(p.content);
                const title = normalizeBlogTitle(p.title);
                const category = normalizeBlogCategory(p.category);
                return (
                  <Link
                    key={p.id}
                    to={`/blog/${p.slug}`}
                    className="group flex flex-col border border-ink/15 hover:border-gold transition-colors"
                  >
                    <BlogPostImage
                      src={p.image_url}
                      alt={title}
                      category={category}
                      aspect="video"
                    />
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {category && (
                          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep">
                            {category}
                          </span>
                        )}
                        {p.published_at && (
                          <>
                            <span className="text-ink/20">·</span>
                            <time
                              className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink/60"
                              dateTime={p.published_at}
                            >
                              {format(new Date(p.published_at), "d MMM", { locale: ru })}
                            </time>
                          </>
                        )}
                      </div>
                      <h3 className="font-serif text-lg sm:text-xl text-ink leading-tight mb-2 group-hover:text-gold-deep transition-colors line-clamp-3">
                        {title}
                      </h3>
                      <p className="text-sm text-ink-soft leading-relaxed line-clamp-3 mb-3 flex-1">
                        {blogExcerpt(p, 140)}
                      </p>
                      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-ink/50 pt-3 border-t border-ink/10">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {min} мин
                        </span>
                        <span className="inline-flex items-center gap-1 text-gold-deep group-hover:gap-2 transition-all">
                          Читать <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPage;
