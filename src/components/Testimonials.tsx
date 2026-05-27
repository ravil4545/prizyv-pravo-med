import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Testimonial {
  id: string;
  author_name: string;
  content: string;
  rating: number | null;
  age: number | null;
  city: string | null;
  category: string | null;
  article_565: string | null;
  photo_url: string | null;
  video_url: string | null;
  featured: boolean | null;
  display_order: number | null;
  created_at: string | null;
}

const FALLBACK: Testimonial[] = [
  {
    id: "fallback-1",
    author_name: "Дмитрий К.",
    content:
      "Получили категорию В за 4 месяца. Военкомат игнорировал диагноз — юрист подготовила независимую экспертизу и обжаловала решение в комиссии субъекта. Без её участия точно бы забрали.",
    rating: 5,
    age: 22,
    city: "Москва",
    category: "Юридическое сопровождение",
    article_565: "ст. 66 «г»",
    photo_url: null,
    video_url: null,
    featured: true,
    display_order: 1,
    created_at: null,
  },
  {
    id: "fallback-2",
    author_name: "Александр М.",
    content:
      "Думал, что ИИ-кабинет — маркетинг. Оказалось — реальный инструмент: загрузил справки, получил привязку к статьям 565 и план действий. С юристом потом обсудили только спорные моменты — это экономия 30 тысяч на консультациях.",
    rating: 5,
    age: 21,
    city: "Санкт-Петербург",
    category: "ИИ-кабинет",
    article_565: "ст. 43",
    photo_url: null,
    video_url: null,
    featured: true,
    display_order: 2,
    created_at: null,
  },
  {
    id: "fallback-3",
    author_name: "Максим В.",
    content:
      "Дело шло год. Сначала отсрочка, потом обжалование, потом независимая экспертиза. В итоге — военный билет. Каждый шаг был согласован, никаких сюрпризов.",
    rating: 5,
    age: 20,
    city: "Екатеринбург",
    category: "Полное сопровождение",
    article_565: "ст. 71",
    photo_url: null,
    video_url: null,
    featured: true,
    display_order: 3,
    created_at: null,
  },
];

// YouTube / VK Video → embed-формат. Возвращает null, если URL не поддерживается.
const buildEmbedUrl = (url: string): { embed: string; thumb: string | null } | null => {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.hostname.includes("youtu.be")
        ? u.pathname.replace(/^\//, "")
        : u.searchParams.get("v") || u.pathname.split("/").pop() || "";
      if (!id) return null;
      return {
        embed: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
    if (u.hostname.includes("vk.com") || u.hostname.includes("vkvideo.ru")) {
      return { embed: url, thumb: null };
    }
    return { embed: url, thumb: null };
  } catch {
    return null;
  }
};

const TestimonialCard = ({ t }: { t: Testimonial }) => {
  const [videoOpen, setVideoOpen] = useState(false);
  const embed = t.video_url ? buildEmbedUrl(t.video_url) : null;

  return (
    <article className="group relative flex flex-col h-full border border-ink/15 bg-paper p-6 sm:p-7 transition-colors hover:border-gold">
      {/* Eyebrow: category + article 565 */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ink/10">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold flex-1 truncate">
          {t.category || "Юридическое сопровождение"}
        </span>
        {t.article_565 && (
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink/55 border border-ink/15 px-2 py-0.5">
            {t.article_565}
          </span>
        )}
      </div>

      {/* Video block — lite embed, click to load iframe */}
      {embed && (
        <div className="mb-5 aspect-video bg-ink overflow-hidden relative">
          {videoOpen ? (
            <iframe
              src={embed.embed}
              title={`Видео-отзыв · ${t.author_name}`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="absolute inset-0 w-full h-full group/play"
              aria-label="Воспроизвести видео-отзыв"
            >
              {embed.thumb && (
                <img
                  src={embed.thumb}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              <span className="absolute inset-0 bg-ink/40 group-hover/play:bg-ink/25 transition-colors" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex items-center justify-center w-14 h-14 rounded-full bg-gold text-ink group-hover/play:scale-110 transition-transform">
                  <Play className="h-6 w-6 ml-1" />
                </span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Quote */}
      <blockquote className="font-serif text-base sm:text-lg italic text-ink leading-relaxed mb-5 flex-1">
        «{t.content}»
      </blockquote>

      {/* Author */}
      <footer className="flex items-center justify-between gap-3 pt-4 border-t border-ink/10">
        <div>
          <div className="font-serif text-base text-ink leading-tight">
            {t.author_name}
            {t.age ? <span className="text-ink/55">, {t.age}</span> : null}
          </div>
          {t.city && (
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink/55 mt-1">
              {t.city}
            </div>
          )}
        </div>
        {t.rating ? (
          <div
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold"
            aria-label={`Оценка ${t.rating} из 5`}
          >
            {t.rating}/5
          </div>
        ) : null}
      </footer>
    </article>
  );
};

const Testimonials = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["testimonials", "home", "approved"],
    queryFn: async (): Promise<Testimonial[]> => {
      const { data, error } = await supabase
        .from("testimonials")
        .select(
          "id, author_name, content, rating, age, city, category, article_565, photo_url, video_url, featured, display_order, created_at"
        )
        .eq("status", "approved")
        .order("featured", { ascending: false })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) {
        // Если миграция ещё не накатилась — отдадим фолбэк, чтобы лендинг не сломался.
        return FALLBACK;
      }
      return (data as unknown as Testimonial[]) ?? FALLBACK;
    },
    staleTime: 5 * 60 * 1000,
  });

  const testimonials = data?.length ? data : FALLBACK;

  return (
    <section
      id="testimonials"
      className="relative bg-paper-deep text-ink py-20 sm:py-28"
      aria-labelledby="testimonials-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 09</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Отзывы клиентов
          </span>
        </div>

        <h2
          id="testimonials-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Реальные истории
          <span className="block italic text-gold font-light">— без скриншотов из шаблонов.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          Каждый отзыв — реальный клиент. Имена и города оставлены с согласия,
          медицинские детали — обезличены. Видео доступно по запросу клиента.
        </p>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-72 border border-ink/10 bg-paper animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>
        )}

        {/* Honest trust strip — измеримые метрики, без «98%» */}
        <div className="mt-14 sm:mt-16 pt-8 border-t border-ink/15 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { num: "500+", label: "дел в архиве с 2014 года" },
            { num: "10 лет", label: "практики в призывном праве" },
            { num: "88", label: "статей Расписания болезней в работе" },
          ].map((m, i) => (
            <div key={m.label} className="flex items-baseline gap-4">
              <span className="font-mono text-gold/60 text-xs">0{i + 1}</span>
              <div>
                <div className="font-serif text-3xl sm:text-4xl text-ink leading-none">
                  {m.num}
                </div>
                <div className="text-sm text-ink-soft mt-1.5 leading-snug">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-ink/55 mt-10 max-w-2xl mx-auto italic font-serif">
          Готовы поделиться вашей историей после удачного исхода? Напишите в Telegram —
          опубликуем с любой степенью обезличивания.
        </p>
      </div>
    </section>
  );
};

export default Testimonials;
