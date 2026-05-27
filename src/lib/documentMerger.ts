// Сборка многостраничного документа на клиенте: пользователь выбирает
// произвольный набор файлов (PDF + JPG/PNG/WebP + фото с камеры) — мы
// рендерим всё в виде страниц и упаковываем в один PDF-blob.
//
// Используются уже имеющиеся в проекте зависимости:
//   • pdfjs-dist — для рендера каждой страницы исходного PDF в canvas
//   • jsPDF     — для сборки финального многостраничного PDF
//
// Это даёт «1 логический документ = 1 файл в Storage = 1 запись в БД» —
// никаких изменений схемы БД и AI-pipeline.

import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

// Без явного workerSrc pdfjs валится в браузере. Файл лежит в /public.
// Несколько мест проекта уже задают этот же путь — здесь дублирую на случай
// если документ-мерджер вызовут раньше, чем смонтируется страница с pdfjs.
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface MergedPageImage {
  /** base64 без префикса data: */
  base64: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.9;

// ── helpers ─────────────────────────────────────────────────────────────

const canvasToJpegBase64 = (canvas: HTMLCanvasElement): Promise<{ base64: string; w: number; h: number }> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Не удалось получить blob из canvas"));
      const reader = new FileReader();
      reader.onload = () => {
        const data = (reader.result as string).split(",")[1] || "";
        resolve({ base64: data, w: canvas.width, h: canvas.height });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, "image/jpeg", JPEG_QUALITY);
  });

const scaleToFit = (w: number, h: number, max: number): { w: number; h: number; scale: number } => {
  const dim = Math.max(w, h);
  if (dim <= max) return { w, h, scale: 1 };
  const scale = max / dim;
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
};

// ── per-file conversion ─────────────────────────────────────────────────

/**
 * Конвертирует один файл в массив страниц-JPEG.
 *   • PDF → одна JPEG на каждую страницу (рендер через pdfjs);
 *   • image/* → одна JPEG (с приведением к JPEG и сжатием).
 *
 * Опционально вызывает onProgress(currentPage, totalPages) для мульти-страничных PDF.
 */
export const fileToPages = async (
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<MergedPageImage[]> => {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: MergedPageImage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const { scale } = scaleToFit(baseViewport.width, baseViewport.height, MAX_DIMENSION);
      // Если PDF мелкий — апскейлим до 1.5x для читаемости; иначе используем scale ≤ 1
      const renderScale = scale === 1 ? 1.5 : scale;
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context недоступен");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdfjs v5: canvas передаётся отдельным параметром
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      const { base64, w, h } = await canvasToJpegBase64(canvas);
      pages.push({ base64, width: w, height: h });
    }
    return pages;
  }

  // image/* (JPEG/PNG/WebP/HEIC — браузер сам решит, рисуем через <img>)
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${file.name}`));
    el.src = dataUrl;
  });

  const { w, h } = scaleToFit(img.width, img.height, MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context недоступен");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { base64 } = await canvasToJpegBase64(canvas);
  return [{ base64, width: w, height: h }];
};

// ── PDF assembly ────────────────────────────────────────────────────────

/**
 * Собирает финальный PDF: каждая страница вписана в портретную A4 с белым фоном,
 * пропорции сохраняются (letterbox, без обрезки).
 */
export const pagesToPdfBlob = (pages: MergedPageImage[]): Blob => {
  if (pages.length === 0) throw new Error("Нечего собирать: ни одной страницы");
  // Единицы — px (упрощает расчёт под изображения).
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pages.forEach((img, idx) => {
    if (idx > 0) pdf.addPage();
    const imgRatio = img.width / img.height;
    const pageRatio = pageWidth / pageHeight;
    let drawW: number, drawH: number;
    if (imgRatio > pageRatio) {
      drawW = pageWidth - 20;
      drawH = drawW / imgRatio;
    } else {
      drawH = pageHeight - 20;
      drawW = drawH * imgRatio;
    }
    const x = (pageWidth - drawW) / 2;
    const y = (pageHeight - drawH) / 2;
    pdf.addImage(`data:image/jpeg;base64,${img.base64}`, "JPEG", x, y, drawW, drawH, undefined, "FAST");
  });

  return pdf.output("blob");
};

/**
 * Удобный one-shot: массив файлов → один PDF-blob.
 * Удобен для прямого вызова из загрузчика, когда промежуточные страницы не нужны.
 */
export const mergeFilesToPdf = async (
  files: File[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<Blob> => {
  if (files.length === 0) throw new Error("Не выбрано ни одного файла");
  const allPages: MergedPageImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i, files.length, `Обработка «${f.name}»…`);
    const pages = await fileToPages(f);
    allPages.push(...pages);
  }
  onProgress?.(files.length, files.length, "Сборка PDF…");
  return pagesToPdfBlob(allPages);
};

// ── Thumbnail helper ────────────────────────────────────────────────────

/**
 * Возвращает data-URL миниатюру для превью в UI. Для PDF берёт первую страницу.
 * Маленький размер (200 px) — чтобы быстро отрисовать ряд миниатюр.
 */
export const buildPreviewThumbnail = async (file: File): Promise<string> => {
  const pages = await fileToPages(file);
  if (pages.length === 0) return "";
  // Сожмём миниатюру до 240 px по большей стороне ради скорости отрисовки
  const first = pages[0];
  const tmp = document.createElement("canvas");
  const ratio = first.width / first.height;
  const maxDim = 240;
  const w = ratio > 1 ? maxDim : Math.round(maxDim * ratio);
  const h = ratio > 1 ? Math.round(maxDim / ratio) : maxDim;
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  if (!ctx) return `data:image/jpeg;base64,${first.base64}`;
  const img = await new Promise<HTMLImageElement>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.src = `data:image/jpeg;base64,${first.base64}`;
  });
  ctx.drawImage(img, 0, 0, w, h);
  return tmp.toDataURL("image/jpeg", 0.7);
};
