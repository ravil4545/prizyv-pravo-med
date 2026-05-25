import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import BlogComments from "@/components/BlogComments";
import BlogPostImage from "@/components/BlogPostImage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enhanceTypography, textToMarkdown } from "@/lib/typography";
import { sanitizeHtml } from "@/lib/sanitize";
import { calcReadingTimeMin, readingTimeLabel, autoExcerpt } from "@/lib/blogUtils";
import { ArrowLeft, ArrowRight, Loader2, Calendar, Clock, Send, Copy, Check, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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

const BlogDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPost(data as BlogPost);

      if ((data as BlogPost).category) {
        const { data: rel } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("status", "published")
          .eq("category", (data as BlogPost).category)
          .neq("id", (data as BlogPost).id)
          .order("published_at", { ascending: false })
          .limit(3);
        if (!cancelled) setRelated((rel as BlogPost[]) || []);
      }
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : `https://nepriziv.ru/blog/${slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Ссылка скопирована" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-background">
        <SEOHead
          title="Статья не найдена | Александра Важанина — юрист"
          description="К сожалению, такой статьи в нашем блоге нет. Вернитесь к полному списку."
        />
        <Header />
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="font-serif text-3xl text-ink mb-3">Статья не найдена</h1>
            <p className="text-ink-soft mb-6">
              Возможно, она была удалена или вы перешли по устаревшей ссылке.
            </p>
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              К блогу
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const readMinutes = calcReadingTimeMin(post.content);
  const dateLabel = post.published_at
    ? format(new Date(post.published_at), "d MMMM yyyy", { locale: ru })
    : null;
  const description = post.excerpt?.trim() || autoExcerpt(post.content);
  const pageTitle = `${post.title} | Блог · Александра Важанина`;
  const keywords = `${post.title}, ${post.category || "блог"}, призыв, военкомат, юрист, ${dateLabel || ""}`;

  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`;
  const waShare = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title} — ${shareUrl}`)}`;

  const isHtml = post.content.includes("<p>") || post.content.includes("<h");

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={pageTitle} description={description} keywords={keywords} />
      <Header />

      {/* Schema.org BlogPosting */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description,
            articleSection: post.category || undefined,
            datePublished: post.published_at || post.created_at,
            dateModified: post.published_at || post.created_at,
            image: post.image_url || undefined,
            mainEntityOfPage: { "@type": "WebPage", "@id": shareUrl },
            author: { "@type": "Person", name: "Важанина Александра Евгеньевна" },
            publisher: {
              "@type": "Organization",
              name: "nepriziv.ru",
              logo: { "@type": "ImageObject", url: "https://nepriziv.ru/og-image.png" },
            },
          }),
        }}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-14 pb-24 md:pb-16">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/60 mb-6 flex items-center gap-2 flex-wrap">
            <Link to="/" className="hover:text-gold transition-colors">Главная</Link>
            <span className="text-ink/30">/</span>
            <Link to="/blog" className="hover:text-gold transition-colors">Блог</Link>
            {post.category && (
              <>
                <span className="text-ink/30">/</span>
                <Link
                  to={`/blog?category=${encodeURIComponent(post.category)}`}
                  className="hover:text-gold transition-colors"
                >
                  {post.category}
                </Link>
              </>
            )}
          </nav>

          {/* Title block */}
          <header className="border-b border-ink/15 pb-6 mb-6">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              {post.category && (
                <span className="font-mono text-xs tracking-[0.2em] text-gold uppercase">
                  {post.category}
                </span>
              )}
              {dateLabel && (
                <>
                  <span className="text-ink/20">·</span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.15em] text-ink/60 uppercase">
                    <Calendar className="h-3 w-3" />
                    {dateLabel}
                  </span>
                </>
              )}
              <span className="text-ink/20">·</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.15em] text-ink/60 uppercase">
                <Clock className="h-3 w-3" />
                {readingTimeLabel(readMinutes)}
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-4 text-base sm:text-lg text-ink-soft leading-relaxed">
                {post.excerpt}
              </p>
            )}
          </header>

          {/* Hero image */}
          <div className="mb-8 border border-ink/10">
            <BlogPostImage
              src={post.image_url}
              alt={post.title}
              category={post.category}
              aspect="video"
            />
          </div>

          {/* Article body */}
          <article
            className="prose prose-base sm:prose-lg max-w-none
              prose-headings:font-serif prose-headings:text-ink prose-headings:font-normal
              prose-h2:text-2xl sm:prose-h2:text-3xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-ink/15
              prose-h3:text-xl sm:prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3
              prose-p:text-ink-soft prose-p:leading-relaxed prose-p:text-[15px] sm:prose-p:text-base
              prose-strong:text-ink prose-strong:font-semibold
              prose-a:text-gold-deep prose-a:no-underline hover:prose-a:underline
              prose-li:text-ink-soft prose-li:leading-relaxed prose-li:my-1
              prose-ul:my-4 prose-ol:my-4
              prose-blockquote:border-l-2 prose-blockquote:border-gold prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-ink/80 prose-blockquote:not-italic
              prose-code:bg-paper-deep prose-code:text-ink prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-ink prose-pre:text-paper prose-pre:p-4
              prose-img:border prose-img:border-ink/10
              prose-hr:border-ink/15 prose-hr:my-10"
          >
            {isHtml ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {enhanceTypography(textToMarkdown(post.content))}
              </ReactMarkdown>
            )}
          </article>

          {/* Share */}
          <section className="border-y border-ink/15 my-10 py-6">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/60">
                Поделиться
              </span>
              <a
                href={tgShare}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/20 hover:border-gold hover:bg-gold/5 text-sm transition-colors"
              >
                <Send className="h-3.5 w-3.5" /> Telegram
              </a>
              <a
                href={waShare}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/20 hover:border-gold hover:bg-gold/5 text-sm transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/20 hover:border-gold hover:bg-gold/5 text-sm transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Скопировано" : "Скопировать ссылку"}
              </button>
            </div>
          </section>

          {/* CTA */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <Link
              to="/dashboard/medical-documents"
              className="group flex flex-col p-5 border border-ink/20 hover:border-gold hover:bg-gold/5 transition-colors"
            >
              <h3 className="font-serif text-lg text-ink mb-1">Проверить свою категорию</h3>
              <p className="text-sm text-ink-soft mb-3 flex-1">
                Загрузите медицинские документы — ИИ оценит ваши шансы на освобождение.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep inline-flex items-center gap-1">
                Бесплатно <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
            <a
              href="tel:+79253500533"
              className="group flex flex-col p-5 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              <h3 className="font-serif text-lg mb-1">Спросить юриста</h3>
              <p className="text-sm opacity-80 mb-3 flex-1">
                Александра разберёт вашу ситуацию на бесплатной вводной консультации.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1">
                +7 925 350-05-33 <ArrowRight className="h-3 w-3" />
              </span>
            </a>
          </section>

          {/* Comments */}
          <BlogComments postId={post.id} />

          {/* Related */}
          {related.length > 0 && (
            <section className="mt-14">
              <div className="flex items-center gap-3 mb-5">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                  Похожие статьи
                </span>
                <span className="h-px flex-1 bg-ink/15" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to={`/blog/${r.slug}`}
                    className="group flex flex-col border border-ink/15 hover:border-gold transition-colors"
                  >
                    <BlogPostImage
                      src={r.image_url}
                      alt={r.title}
                      category={r.category}
                      aspect="video"
                    />
                    <div className="p-4">
                      <h3 className="font-serif text-base text-ink leading-tight group-hover:text-gold-deep transition-colors line-clamp-3">
                        {r.title}
                      </h3>
                      {r.published_at && (
                        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink/50 mt-2">
                          {format(new Date(r.published_at), "d MMM yyyy", { locale: ru })}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="flex justify-center mt-12">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 hover:text-gold"
            >
              <ArrowLeft className="h-3 w-3" /> Все статьи блога
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BlogDetailPage;
