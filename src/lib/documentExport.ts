/// <reference lib="dom" />
// ════════════════════════════════════════════════════════════════════════
//  Выгрузка документа: скачивание файла, сохранение распознанного текста,
//  печать. Вынесено из MedicalDocumentsPage.tsx.
//
//  БЕЗОПАСНОСТЬ. Окно печати собиралось строкой, и название документа
//  подставлялось в неё как есть — в <title>, в <h1> и в атрибут alt.
//  Название берётся из имени загруженного файла, то есть задаётся
//  пользователем: файл с именем вида `<img src=x onerror=…>.pdf` выполнял
//  бы свой код в окне печати. Окно открывается через window.open("") и
//  наследует origin сайта — вместе с сессией Supabase в localStorage.
//  Теперь всё, что попадает в разметку, проходит через escapeHtml.
// ════════════════════════════════════════════════════════════════════════

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { escapeHtml } from "./escapeHtml";
import type { MedicalDocument } from "./medicalDocumentTypes";

/** Расширение по фактическому файлу в хранилище. */
export function documentFileExtension(fileUrl: string): string {
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".docx")) return ".docx";
  if (lower.endsWith(".pdf")) return ".pdf";
  return ".jpg";
}

/**
 * Имя файла для скачивания. Название документа задаёт пользователь (имя
 * загруженного файла, ответ ИИ), поэтому вычищаем всё, чем можно уйти из
 * папки загрузок или получить неоткрываемый файл.
 */
export function safeFileName(title: string | null, suffix: string): string {
  const base = (title ?? "")
    // Разделители путей и символы, запрещённые в именах файлов Windows.
    // Дефис намеренно НЕ трогаем: «МРТ-2026» — нормальное название.
    .replace(/[\\/:*?"<>|]+/g, " ")
    // «..» — попытка подняться на уровень выше.
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    // Ведущая точка делает файл скрытым в Unix, хвостовую отбрасывает Windows.
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return `${base || "document"}${suffix}`;
}

/** Скачивание готового Blob под заданным именем. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Распознанный текст документа отдельным .txt. */
export function downloadExtractedText(doc: MedicalDocument): boolean {
  if (!doc.raw_text) return false;
  downloadBlob(
    new Blob([doc.raw_text], { type: "text/plain;charset=utf-8" }),
    safeFileName(doc.title, "_text.txt"),
  );
  return true;
}

const PRINT_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; }
.container { padding: 20px; }
.header { margin-bottom: 20px; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
.header h1 { font-size: 16px; margin: 0 0 5px; }
.header p { color: #666; font-size: 12px; }
.image-container { text-align: center; }
img { max-width: 100%; height: auto; }
.no-print { margin: 20px; text-align: center; }
.no-print button { padding: 10px 30px; font-size: 16px; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 5px; margin-right: 10px; }
.no-print button:hover { background: #2563eb; }
.no-print .close-btn { background: #6b7280; }
.no-print .close-btn:hover { background: #4b5563; }
@media print {
  .no-print { display: none; }
  .container { padding: 0; }
}`;

function formatDocumentDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd.MM.yyyy", { locale: ru });
}

/** Разметка окна печати. Чистая функция — покрыта тестами на экранирование. */
export function buildPrintHtml(doc: MedicalDocument, signedUrl: string): string {
  const title = escapeHtml(doc.title || "Медицинский документ");
  const date = formatDocumentDate(doc.document_date);
  const dateLine = date ? `<p>Дата документа: ${escapeHtml(date)}</p>` : "";

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <div class="no-print">
      <button onclick="window.print()">Печать</button>
      <button class="close-btn" onclick="window.close()">Закрыть</button>
    </div>
    <div class="container">
      <div class="header">
        <h1>${title}</h1>
        ${dateLine}
      </div>
      <div class="image-container">
        <img src="${escapeHtml(signedUrl)}" alt="${title}" />
      </div>
    </div>
  </body>
</html>`;
}

export type PrintResult = "ok" | "popup-blocked";

/** Открывает окно печати. Вызывающий сам показывает подсказку при блокировке. */
export function openPrintWindow(doc: MedicalDocument, signedUrl: string): PrintResult {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return "popup-blocked";
  printWindow.document.write(buildPrintHtml(doc, signedUrl));
  printWindow.document.close();
  return "ok";
}
