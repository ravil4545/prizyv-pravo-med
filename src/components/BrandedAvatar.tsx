import { useState } from "react";

interface BrandedAvatarProps {
  /** URL фото юриста; если пустой или ошибочный — рендерится SVG-плейсхолдер */
  src?: string | null;
  /** ФИО для генерации инициалов в плейсхолдере и alt */
  name: string;
  className?: string;
  /** "square" — без round (default), "round" — круглая аватарка */
  shape?: "square" | "round";
}

const initialsOf = (full: string): string => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Ю";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

/**
 * Editorial SVG-плейсхолдер: paper-цвет фон, золотая угловая рамка,
 * крупные инициалы серифом и подпись «ЮРИСТ» снизу.
 * Используется когда у юриста нет фото — карточки/портреты не пустые,
 * выглядят в стиле бренда.
 */
const PlaceholderSVG = ({ name }: { name: string }) => {
  const initials = initialsOf(name);
  return (
    <svg
      viewBox="0 0 200 260"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className="w-full h-full"
      role="img"
      aria-label={`Портрет ${name}`}
    >
      <rect width="200" height="260" fill="#f4ecdd" />
      {/* hatch pattern */}
      <defs>
        <pattern id="ba-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#0d1b2a" strokeOpacity="0.04" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="200" height="260" fill="url(#ba-hatch)" />

      {/* Gold corner brackets */}
      <path d="M10 10 L10 28 M10 10 L28 10" stroke="#c9a227" strokeWidth="1.5" fill="none" />
      <path d="M190 10 L190 28 M190 10 L172 10" stroke="#c9a227" strokeWidth="1.5" fill="none" />
      <path d="M10 250 L10 232 M10 250 L28 250" stroke="#c9a227" strokeWidth="1.5" fill="none" />
      <path d="M190 250 L190 232 M190 250 L172 250" stroke="#c9a227" strokeWidth="1.5" fill="none" />

      {/* Top label */}
      <text
        x="100"
        y="32"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontSize="8"
        letterSpacing="3"
        fill="#0d1b2a"
        opacity="0.5"
      >
        ДОСЬЕ · ЮРИСТ
      </text>
      <line x1="80" y1="40" x2="120" y2="40" stroke="#c9a227" strokeWidth="1" />

      {/* Big initials */}
      <text
        x="100"
        y="150"
        textAnchor="middle"
        fontFamily="Georgia, 'Playfair Display', serif"
        fontStyle="italic"
        fontSize="78"
        fill="#0d1b2a"
        opacity="0.85"
      >
        {initials}
      </text>

      {/* Bottom strip */}
      <rect x="0" y="220" width="200" height="40" fill="#0d1b2a" opacity="0.9" />
      <text
        x="100"
        y="240"
        textAnchor="middle"
        fontFamily="Georgia, 'Playfair Display', serif"
        fontSize="11"
        letterSpacing="2"
        fill="#f4ecdd"
        opacity="0.95"
      >
        {name.length > 24 ? name.substring(0, 22) + "…" : name}
      </text>
      <text
        x="100"
        y="252"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontSize="6"
        letterSpacing="2"
        fill="#c9a227"
        opacity="0.9"
      >
        NEPRIZIV.RU
      </text>
    </svg>
  );
};

const BrandedAvatar = ({ src, name, className = "", shape = "square" }: BrandedAvatarProps) => {
  const [errored, setErrored] = useState(false);
  const showPlaceholder = !src || errored;
  const radius = shape === "round" ? "rounded-full" : "";

  return (
    <div className={`relative overflow-hidden bg-paper ${radius} ${className}`}>
      {showPlaceholder ? (
        <PlaceholderSVG name={name} />
      ) : (
        <img
          src={src!}
          alt={`Портрет ${name}`}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover object-top"
        />
      )}
    </div>
  );
};

export default BrandedAvatar;
