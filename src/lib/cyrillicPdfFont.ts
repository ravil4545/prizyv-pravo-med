// Решение проблемы «крякозябры в PDF»:
//
// jsPDF из коробки умеет только Helvetica / Times — это Type-1 шрифты без
// поддержки Unicode, поэтому весь русский текст превращается в мусор.
//
// Подход: при первом экспорте PDF подгружаем TTF-шрифт с кириллицей с CDN,
// конвертируем в base64, регистрируем в jsPDF через addFileToVFS + addFont и
// кешируем результат в памяти + sessionStorage (чтобы повторный экспорт был
// мгновенным).
//
// Без новых npm-зависимостей: fetch'им TTF с jsDelivr, который раздаёт пакеты
// @fontsource. Файл ~ 90 КБ, грузится один раз.

import type { jsPDF } from "jspdf";

// CDN-источники TTF-шрифтов с кириллицей. Пробуем по порядку — если первый
// упал (например, заблокирован CSP / нет интернета), переходим к следующему.
const FONT_SOURCES: Array<{ name: string; url: string }> = [
  {
    name: "PTSans-Regular",
    url: "https://cdn.jsdelivr.net/npm/@fontsource/pt-sans@5.0.5/files/pt-sans-cyrillic-400-normal.ttf",
  },
  {
    name: "PTSans-Regular",
    url: "https://unpkg.com/@fontsource/pt-sans@5.0.5/files/pt-sans-cyrillic-400-normal.ttf",
  },
  {
    name: "Roboto-Regular",
    url: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-cyrillic-400-normal.ttf",
  },
];

const FONT_BOLD_SOURCES: Array<{ name: string; url: string }> = [
  {
    name: "PTSans-Bold",
    url: "https://cdn.jsdelivr.net/npm/@fontsource/pt-sans@5.0.5/files/pt-sans-cyrillic-700-normal.ttf",
  },
  {
    name: "PTSans-Bold",
    url: "https://unpkg.com/@fontsource/pt-sans@5.0.5/files/pt-sans-cyrillic-700-normal.ttf",
  },
];

const CACHE_KEY_REGULAR = "cyrillic_pdf_font_regular_b64";
const CACHE_KEY_BOLD = "cyrillic_pdf_font_bold_b64";

let inMemoryRegular: string | null = null;
let inMemoryBold: string | null = null;

const fetchAsBase64 = async (url: string): Promise<string> => {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Конвертация Uint8Array → base64 «вручную», чтобы не тащить полифил
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
};

const loadFont = async (sources: Array<{ name: string; url: string }>, cacheKey: string): Promise<{ name: string; base64: string }> => {
  // 1. Память текущей сессии
  if (cacheKey === CACHE_KEY_REGULAR && inMemoryRegular) {
    return { name: sources[0].name, base64: inMemoryRegular };
  }
  if (cacheKey === CACHE_KEY_BOLD && inMemoryBold) {
    return { name: sources[0].name, base64: inMemoryBold };
  }
  // 2. sessionStorage — переживает навигацию между страницами
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      if (cacheKey === CACHE_KEY_REGULAR) inMemoryRegular = cached;
      else inMemoryBold = cached;
      return { name: sources[0].name, base64: cached };
    }
  } catch { /* sessionStorage может быть недоступен */ }

  // 3. Качаем с одного из CDN-источников
  let lastErr: unknown;
  for (const src of sources) {
    try {
      const b64 = await fetchAsBase64(src.url);
      if (cacheKey === CACHE_KEY_REGULAR) inMemoryRegular = b64;
      else inMemoryBold = b64;
      try { sessionStorage.setItem(cacheKey, b64); } catch { /* quota? игнор */ }
      return { name: src.name, base64: b64 };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Не удалось загрузить кириллический шрифт ни из одного источника");
};

/**
 * Загружает и регистрирует кириллический шрифт в jsPDF doc.
 * После вызова можно использовать doc.setFont("CyrillicPdf", "normal" | "bold").
 *
 * Возвращает имя зарегистрированного семейства — всегда "CyrillicPdf".
 * Если интернета нет / CDN отвалился — пробрасывает ошибку, чтобы вызывающий
 * мог упасть с понятным сообщением.
 */
export const registerCyrillicFont = async (doc: jsPDF): Promise<string> => {
  const family = "CyrillicPdf";

  const regular = await loadFont(FONT_SOURCES, CACHE_KEY_REGULAR);
  doc.addFileToVFS("CyrillicPdf-Regular.ttf", regular.base64);
  doc.addFont("CyrillicPdf-Regular.ttf", family, "normal");

  // Bold — best effort: если не загрузился, оставим normal для bold
  try {
    const bold = await loadFont(FONT_BOLD_SOURCES, CACHE_KEY_BOLD);
    doc.addFileToVFS("CyrillicPdf-Bold.ttf", bold.base64);
    doc.addFont("CyrillicPdf-Bold.ttf", family, "bold");
  } catch {
    // Fallback: bold = regular (lighter degradation)
    doc.addFont("CyrillicPdf-Regular.ttf", family, "bold");
  }

  doc.setFont(family, "normal");
  return family;
};
