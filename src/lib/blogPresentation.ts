const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&laquo;": "«",
  "&raquo;": "»",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

export interface BlogTextSource {
  title?: string | null;
  content?: string | null;
  excerpt?: string | null;
  category?: string | null;
}

export function blogPlainText(value?: string | null): string {
  if (!value) return "";

  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|quot|apos|laquo|raquo|mdash|ndash|hellip);|&#(34|39);/g, (entity) => ENTITY_MAP[entity] || " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeBlogTitle(title?: string | null): string {
  const plain = blogPlainText(title);
  return plain
    .replace(/^[\s.·:;,\-–—]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeBlogCategory(category?: string | null): string | null {
  const plain = blogPlainText(category).replace(/\s{2,}/g, " ").trim();
  return plain || null;
}

export function blogExcerpt(source: BlogTextSource, maxLen = 180): string {
  const explicit = blogPlainText(source.excerpt);
  const plain = explicit.length >= 40 ? explicit : blogPlainText(source.content);

  if (!plain) return "";
  const collapsed = plain.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;

  const cut = collapsed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const value = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${value.trim()}…`;
}
