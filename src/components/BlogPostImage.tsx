import { useState } from "react";

interface BlogPostImageProps {
  src?: string | null;
  alt: string;
  category?: string | null;
  className?: string;
  /** Override aspect — defaults to "video" (16:9) */
  aspect?: "video" | "square" | "tall" | "auto";
}

interface PlaceholderTheme {
  /** Primary tint */
  bg: string;
  /** Pattern accent */
  accent: string;
  /** Foreground line ink */
  ink: string;
  /** Glyph in the corner */
  glyph: string;
  /** Decorative label rendered along the top */
  label: string;
}

const DEFAULT_THEME: PlaceholderTheme = {
  bg: "#f4ecdd",
  accent: "#c9a227",
  ink: "#0d1b2a",
  glyph: "§",
  label: "Юридический разбор",
};

const THEMES: Record<string, PlaceholderTheme> = {
  призыв: { bg: "#eee2c8", accent: "#c9a227", ink: "#0d1b2a", glyph: "№", label: "Призыв" },
  медицина: { bg: "#e8e6df", accent: "#8a1c2b", ink: "#0d1b2a", glyph: "✚", label: "Медицина" },
  суд: { bg: "#e2dccb", accent: "#0d1b2a", ink: "#8a1c2b", glyph: "§", label: "Судебная защита" },
  военкомат: { bg: "#ede6d3", accent: "#6b2c39", ink: "#0d1b2a", glyph: "★", label: "Военкомат" },
  закон: { bg: "#f4ecdd", accent: "#c9a227", ink: "#0d1b2a", glyph: "§", label: "Право" },
  отсрочка: { bg: "#ece4c9", accent: "#7a5b1a", ink: "#0d1b2a", glyph: "⏱", label: "Отсрочка" },
  документы: { bg: "#ebe6d3", accent: "#0d1b2a", ink: "#c9a227", glyph: "✎", label: "Документы" },
  новости: { bg: "#ede5cf", accent: "#8a1c2b", ink: "#0d1b2a", glyph: "✦", label: "Новости" },
};

function pickTheme(category?: string | null): PlaceholderTheme {
  if (!category) return DEFAULT_THEME;
  const norm = category.toLowerCase().trim();
  for (const key of Object.keys(THEMES)) {
    if (norm.includes(key)) return THEMES[key];
  }
  return DEFAULT_THEME;
}

const ASPECT_CLASS: Record<NonNullable<BlogPostImageProps["aspect"]>, string> = {
  video: "aspect-video",
  square: "aspect-square",
  tall: "aspect-[3/4]",
  auto: "",
};

/**
 * EditorialPlaceholder — пустой холст с editorial-айдентикой: золотая угловая
 * рамка, монограмма «ВА», крупный глиф категории и подпись. Заменяет битые/
 * отсутствующие изображения, оставаясь в палитре бренда.
 */
const EditorialPlaceholder = ({ theme, title }: { theme: PlaceholderTheme; title: string }) => (
  <svg
    viewBox="0 0 400 225"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice"
    className="w-full h-full"
    role="img"
    aria-label={`Иллюстрация к статье «${title}»`}
  >
    <rect width="400" height="225" fill={theme.bg} />

    {/* Diagonal hatch pattern */}
    <defs>
      <pattern id={`hatch-${theme.glyph.charCodeAt(0)}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="14" stroke={theme.ink} strokeOpacity="0.04" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="400" height="225" fill={`url(#hatch-${theme.glyph.charCodeAt(0)})`} />

    {/* Gold corner brackets */}
    <path d="M16 16 L16 40 M16 16 L40 16" stroke={theme.accent} strokeWidth="2" fill="none" />
    <path d="M384 16 L384 40 M384 16 L360 16" stroke={theme.accent} strokeWidth="2" fill="none" />
    <path d="M16 209 L16 185 M16 209 L40 209" stroke={theme.accent} strokeWidth="2" fill="none" />
    <path d="M384 209 L384 185 M384 209 L360 209" stroke={theme.accent} strokeWidth="2" fill="none" />

    {/* Top label */}
    <text
      x="200"
      y="42"
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, monospace"
      fontSize="9"
      letterSpacing="3"
      fill={theme.ink}
      opacity="0.65"
    >
      {theme.label.toUpperCase()}
    </text>
    <line x1="160" y1="52" x2="240" y2="52" stroke={theme.accent} strokeWidth="1" />

    {/* Big glyph */}
    <text
      x="200"
      y="138"
      textAnchor="middle"
      fontFamily="Georgia, 'Playfair Display', serif"
      fontSize="86"
      fill={theme.accent}
      opacity="0.9"
    >
      {theme.glyph}
    </text>

    {/* Bottom monogram */}
    <text
      x="200"
      y="186"
      textAnchor="middle"
      fontFamily="Georgia, 'Playfair Display', serif"
      fontSize="14"
      letterSpacing="2"
      fill={theme.ink}
      opacity="0.75"
    >
      ВАЖАНИНА · А.Е.
    </text>
    <text
      x="200"
      y="200"
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, monospace"
      fontSize="7"
      letterSpacing="3"
      fill={theme.ink}
      opacity="0.5"
    >
      NEPRIZIV.RU
    </text>
  </svg>
);

const BlogPostImage = ({ src, alt, category, className = "", aspect = "video" }: BlogPostImageProps) => {
  const [errored, setErrored] = useState(false);
  const theme = pickTheme(category);
  const showPlaceholder = !src || errored;
  const aspectClass = ASPECT_CLASS[aspect];

  return (
    <div className={`relative overflow-hidden bg-paper ${aspectClass} ${className}`}>
      {showPlaceholder ? (
        <EditorialPlaceholder theme={theme} title={alt} />
      ) : (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
};

export default BlogPostImage;
