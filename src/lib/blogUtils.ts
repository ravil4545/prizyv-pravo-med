import { slugifyRu } from "./slug";

const WORDS_PER_MINUTE = 180;

export function autoSlugFromTitle(title: string): string {
  return slugifyRu(title) || "post";
}

export function calcReadingTimeMin(content: string): number {
  if (!content) return 1;
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function autoExcerpt(content: string, maxLen = 180): string {
  if (!content) return "";
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLen) return plain;
  const cut = plain.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut).trim() + "…";
}

export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function readingTimeLabel(min: number): string {
  return `${min} ${plural(min, ["мин", "мин", "мин"])} чтения`;
}
