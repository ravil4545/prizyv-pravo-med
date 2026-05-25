import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Star, ArrowRight, Phone, Loader2, MapPin, ArrowLeft } from "lucide-react";
import { makeCommissariatSlug } from "@/lib/slug";

interface Rating {
  id: string;
  commissariat_name: string;
  city: string;
  region: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

const StarRow = ({ value, max = 5, size = "h-4 w-4" }: { value: number; max?: number; size?: string }) => (
  <div className="flex gap-0.5">
    {Array.from({ length: max }).map((_, i) => (
      <Star
        key={i}
        className={`${size} ${
          i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
        }`}
      />
    ))}
  </div>
);

const CommissariatDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);

      const { data } = await supabase
        .from("commissariat_ratings")
        .select("*")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      const all = (data as Rating[]) || [];
      const matched = all.filter((r) => makeCommissariatSlug(r.commissariat_name, r.city) === slug);

      if (matched.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setRatings(matched);
      setName(matched[0].commissariat_name);
      setCity(matched[0].city);
      setRegion(matched[0].region);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

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

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <SEOHead
          title="Военкомат не найден | Александра Важанина — юрист"
          description="К сожалению, такого военкомата в нашем справочнике нет. Посмотрите полный список или добавьте свой отзыв."
        />
        <Header />
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="font-serif text-3xl text-ink mb-3">Военкомат не найден</h1>
            <p className="text-ink-soft mb-6">
              Возможно, отзывы были удалены или ссылка устарела.
            </p>
            <Link
              to="/commissariats"
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              К справочнику военкоматов
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const avgRating = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
  const reviewsWithComment = ratings.filter((r) => r.comment && r.comment.trim().length > 0);
  const locationLabel = region ? `${city}, ${region}` : city;

  const pageTitle = `${name} (${city}) — отзывы и рейтинг | Юрист по призыву`;
  const pageDescription = `${name} в ${locationLabel}: ${ratings.length} отзывов призывников, средняя оценка ${avgRating.toFixed(1)}/5. Юридическая помощь по призыву — бесплатная вводная.`;
  const keywords = `${name}, военкомат ${city}, отзывы военкомат, рейтинг военкомата, призывник ${city}, юрист по призыву ${city}`;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={pageTitle} description={pageDescription} keywords={keywords} />
      <Header />

      {/* Schema.org GovernmentOffice */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "GovernmentOffice",
            name,
            address: {
              "@type": "PostalAddress",
              addressLocality: city,
              addressRegion: region || undefined,
              addressCountry: "RU",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: avgRating.toFixed(2),
              reviewCount: ratings.length,
              bestRating: 5,
              worstRating: 1,
            },
            review: reviewsWithComment.slice(0, 5).map((r) => ({
              "@type": "Review",
              reviewRating: {
                "@type": "Rating",
                ratingValue: r.rating,
                bestRating: 5,
              },
              reviewBody: r.comment,
              datePublished: r.created_at,
            })),
          }),
        }}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 pb-24 md:pb-16">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/60 mb-6 flex items-center gap-2 flex-wrap">
            <Link to="/" className="hover:text-gold transition-colors">Главная</Link>
            <span className="text-ink/30">/</span>
            <Link to="/commissariats" className="hover:text-gold transition-colors">Военкоматы</Link>
            <span className="text-ink/30">/</span>
            <span className="text-ink truncate">{city}</span>
          </nav>

          {/* Title block */}
          <header className="border-b border-ink/15 pb-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-gold" />
              <span className="font-mono text-xs tracking-[0.2em] text-gold uppercase">
                {locationLabel}
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
              {name}
            </h1>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <StarRow value={avgRating} size="h-5 w-5" />
              <span className="font-semibold text-lg text-ink">{avgRating.toFixed(1)}</span>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60">
                · {ratings.length} {ratings.length === 1 ? "отзыв" : ratings.length < 5 ? "отзыва" : "отзывов"}
              </span>
            </div>
          </header>

          {/* Reviews */}
          {reviewsWithComment.length > 0 ? (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                  Отзывы призывников
                </span>
                <span className="h-px flex-1 bg-ink/15" />
              </div>
              <div className="space-y-5">
                {reviewsWithComment.map((r) => (
                  <article key={r.id} className="border-l-2 border-ink/15 pl-4">
                    <div className="flex items-center gap-2 mb-2">
                      <StarRow value={r.rating} />
                      <time className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink/50">
                        {new Date(r.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <p className="text-ink-soft leading-relaxed whitespace-pre-line">{r.comment}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="mb-10 border border-ink/10 p-6 text-center">
              <p className="text-ink-soft">
                Пока нет развёрнутых отзывов. Призывники оценили на {avgRating.toFixed(1)} из 5.
              </p>
              <button
                onClick={() => navigate("/commissariats")}
                className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold hover:text-gold-deep"
              >
                Оставить свой отзыв <ArrowRight className="h-3 w-3" />
              </button>
            </section>
          )}

          {/* CTA */}
          <section className="border-y border-ink/15 py-8 my-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              to="/dashboard"
              className="group flex flex-col p-5 border border-ink/20 hover:border-gold hover:bg-gold/5 transition-colors"
            >
              <h3 className="font-serif text-lg text-ink mb-1">
                Подготовиться к военкомату {city}
              </h3>
              <p className="text-sm text-ink-soft mb-3 flex-1">
                Загрузите медицинские документы — ИИ оценит вашу категорию годности до похода в военкомат.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep inline-flex items-center gap-1">
                Бесплатно <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
            <a
              href="tel:+79253500533"
              className="group flex flex-col p-5 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              <Phone className="h-5 w-5 text-gold group-hover:text-ink mb-3" />
              <h3 className="font-serif text-lg mb-1">
                Спросить юриста
              </h3>
              <p className="text-sm opacity-80 mb-3 flex-1">
                Александра разберёт вашу ситуацию с этим военкоматом на вводной консультации.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1">
                Бесплатная вводная <ArrowRight className="h-3 w-3" />
              </span>
            </a>
          </section>

          {/* Disclaimer */}
          <aside className="border-l-2 border-gold/40 pl-4 py-2 mb-10">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep mb-1">
              Важно
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Отзывы оставлены пользователями сайта. Если вы представитель военкомата или хотите сообщить о
              некорректной информации — свяжитесь с нами через раздел контактов.
            </p>
          </aside>

          <div className="flex justify-center">
            <Link
              to="/commissariats"
              className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 hover:text-gold"
            >
              <ArrowLeft className="h-3 w-3" /> Все военкоматы
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CommissariatDetailPage;
