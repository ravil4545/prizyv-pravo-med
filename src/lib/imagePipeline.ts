/// <reference lib="dom" />
// ════════════════════════════════════════════════════════════════════════
//  Подготовка снимков документов: фото/PDF → JPEG → сжатие → сборка в PDF.
//
//  Вынесено из MedicalDocumentsPage.tsx. Ни одна из этих функций не читала
//  состояние компонента — они висели внутри страницы только исторически, и
//  из-за этого их нельзя было переиспользовать в мастере загрузки и нечем
//  было проверить геометрию страницы.
//
//  Всё выполняется В БРАУЗЕРЕ: снимок сжимается до отправки, на сервер
//  уходит уже уменьшенная копия. Это не только про трафик — это про
//  152-ФЗ: чем меньше исходников покидает устройство, тем лучше.
// ════════════════════════════════════════════════════════════════════════

import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

// Модуль самодостаточен: раньше воркер настраивала страница, и вынос функций
// наружу молча ломал бы разбор PDF везде, где страница не загружена.
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface SizedImage {
  /** JPEG в base64 БЕЗ префикса data:. */
  base64: string;
  width: number;
  height: number;
}

/** Предел стороны: дальше vision-модели всё равно ужимают сами. */
export const MAX_IMAGE_DIMENSION = 2000;

/** Размер страницы A4 в пикселях — запасной вариант, если картинка не читается. */
export const FALLBACK_PAGE_SIZE = { width: 800, height: 1100 };

/** Поля PDF-страницы в пикселях (по 10 с каждой стороны). */
const PDF_PAGE_PADDING = 20;

const JPEG_QUALITY_CONVERT = 0.95;
const JPEG_QUALITY_COMPRESS = 0.85;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Белая подложка обязательна: у документа со сканера фон прозрачный (PNG),
 * а без заливки прозрачность в JPEG становится ЧЁРНОЙ — текст пропадает.
 */
function newWhiteCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Масштаб рендера PDF-страницы: крупнее для читаемости, но не больше предела. */
export function pdfRenderScale(width: number, height: number): number {
  const maxOriginal = Math.max(width, height);
  return maxOriginal > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxOriginal : 1.5;
}

/** Первая страница PDF → JPEG. */
async function pdfFirstPageToJpeg(file: File): Promise<{ blob: Blob; base64: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const original = page.getViewport({ scale: 1.0 });
  const viewport = page.getViewport({ scale: pdfRenderScale(original.width, original.height) });

  const { canvas, ctx } = newWhiteCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY_CONVERT);
  if (!blob) throw new Error("Не удалось преобразовать страницу PDF в изображение");
  return { blob, base64: await blobToBase64(blob) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    img.src = src;
  });
}

/** Файл (PDF или картинка) → JPEG. */
export async function convertToJpeg(file: File): Promise<{ blob: Blob; base64: string }> {
  if (file.type === "application/pdf") {
    try {
      return await pdfFirstPageToJpeg(file);
    } catch (error) {
      console.error("PDF conversion error:", error);
      throw new Error("Не удалось обработать PDF файл");
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);
  const { canvas, ctx } = newWhiteCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY_CONVERT);
  if (!blob) throw new Error("Не удалось преобразовать изображение");
  return { blob, base64: await blobToBase64(blob) };
}

/** Новые размеры при ограничении ширины (пропорции сохраняются). */
export function scaleToMaxWidth(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: (height * maxWidth) / width };
}

/**
 * Уменьшение снимка перед отправкой. При любой ошибке возвращает исходник —
 * лучше отправить тяжёлый файл, чем потерять документ человека.
 */
export async function compressImage(
  base64: string,
  maxWidth: number = MAX_IMAGE_DIMENSION,
): Promise<string> {
  try {
    const img = await loadImage(`data:image/jpeg;base64,${base64}`);
    const size = scaleToMaxWidth(img.width, img.height, maxWidth);

    const { canvas, ctx } = newWhiteCanvas(size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);

    const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY_COMPRESS);
    return blob ? await blobToBase64(blob) : base64;
  } catch {
    return base64;
  }
}

/** Размеры JPEG из base64; если не читается — размер A4. */
export async function getImageDimensions(
  base64: string,
): Promise<{ width: number; height: number }> {
  try {
    const img = await loadImage(`data:image/jpeg;base64,${base64}`);
    return { width: img.width, height: img.height };
  } catch {
    return { ...FALLBACK_PAGE_SIZE };
  }
}

export interface PlacedImage {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Вписывает изображение в страницу с полями, по центру и БЕЗ обрезки.
 * Обрезать нельзя: у медицинской справки печать и подпись стоят по краю
 * листа — именно то, что проверяет ВВК.
 */
export function fitImageToPage(
  image: { width: number; height: number },
  page: { width: number; height: number },
  padding: number = PDF_PAGE_PADDING,
): PlacedImage {
  const safeWidth = Math.max(page.width - padding, 1);
  const safeHeight = Math.max(page.height - padding, 1);
  const imgRatio = image.width / image.height;

  // Ориентируемся на ту сторону, которая упрётся в поля первой.
  const width = imgRatio > safeWidth / safeHeight ? safeWidth : safeHeight * imgRatio;
  const height = imgRatio > safeWidth / safeHeight ? safeWidth / imgRatio : safeHeight;

  return {
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };
}

/** Собирает многостраничный PDF из готовых JPEG — по странице на снимок. */
export async function createPdfFromImages(images: SizedImage[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "px" });

  images.forEach((img, i) => {
    if (i > 0) pdf.addPage();
    const page = {
      width: pdf.internal.pageSize.getWidth(),
      height: pdf.internal.pageSize.getHeight(),
    };
    const box = fitImageToPage(img, page);
    pdf.addImage(
      `data:image/jpeg;base64,${img.base64}`,
      "JPEG",
      box.x,
      box.y,
      box.width,
      box.height,
    );
  });

  return pdf.output("blob");
}

/** Файл → сжатый JPEG с размерами: типовой путь для одной страницы. */
export async function fileToSizedImage(file: File): Promise<SizedImage> {
  const { base64 } = await convertToJpeg(file);
  const compressed = await compressImage(base64);
  const dimensions = await getImageDimensions(compressed);
  return { base64: compressed, ...dimensions };
}
