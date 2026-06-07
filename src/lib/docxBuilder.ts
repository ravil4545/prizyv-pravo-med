// ════════════════════════════════════════════════════════════════════════
//  Сборка документа из текста + таблиц + настроек формата.
//   - buildDocxBlob: .docx через пакет `docx` (кириллица из коробки, шрифты,
//     ориентация, таблицы). Ленивый импорт, чтобы отсутствие пакета не валило бандл.
//   - printDoc: окно печати с корректной кириллицей и @page-ориентацией (→ «Сохранить как PDF»
//     средствами браузера; надёжнее, чем jsPDF без встроенного TTF).
// ════════════════════════════════════════════════════════════════════════

import type { Paragraph as ParagraphT, Table as TableT } from "docx";

export type Orientation = "portrait" | "landscape";

export interface DocFormat {
  orientation: Orientation;
  fontFamily: string;
  fontSizePt: number;
}

export interface DocTable {
  rows: string[][];
  headerRow: boolean;
}

export const FONT_OPTIONS = ["Times New Roman", "PT Astra Serif", "Arial", "Calibri", "Georgia"];
export const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14];

export const DEFAULT_FORMAT: DocFormat = {
  orientation: "portrait",
  fontFamily: "Times New Roman",
  fontSizePt: 12,
};

const TITLE_MARKERS = ["ЗАЯВЛЕНИЕ", "ЖАЛОБА", "ХОДАТАЙСТВО", "АКТ", "ДОВЕРЕННОСТЬ", "АДМИНИСТРАТИВНОЕ"];

export const isTitleLine = (line: string): boolean => {
  const t = line.trim().toUpperCase();
  return TITLE_MARKERS.some((m) => t.startsWith(m));
};

/** Делит текст на «шапку» (до заголовка) и «тело» (с заголовка). */
export function splitHeaderBody(text: string): { header: string; body: string } {
  const lines = text.split("\n");
  const idx = lines.findIndex(isTitleLine);
  if (idx <= 0) return { header: "", body: text };
  let end = idx;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return {
    header: lines.slice(0, end).join("\n").trim(),
    body: lines.slice(idx).join("\n").trim(),
  };
}

// ── DOCX ────────────────────────────────────────────────────────────────────
export async function buildDocxBlob(opts: {
  title: string;
  text: string;
  tables?: DocTable[];
  format: DocFormat;
}): Promise<Blob> {
  let docx: typeof import("docx");
  try {
    docx = await import("docx");
  } catch {
    throw new Error("Пакет `docx` не установлен. Запустите `bun install` (или `npm install`).");
  }
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
    Table, TableRow, TableCell, WidthType, PageOrientation, BorderStyle,
  } = docx;

  const { format } = opts;
  const sizeHalfPt = Math.round(format.fontSizePt * 2);
  const font = format.fontFamily;
  const run = (text: string, extra: Record<string, unknown> = {}) =>
    new TextRun({ text, font, size: sizeHalfPt, ...extra });

  const { header, body } = splitHeaderBody(opts.text);

  const nodes: (ParagraphT | TableT)[] = [];

  // Шапка — справа
  if (header) {
    for (const line of header.split("\n")) {
      nodes.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 60 }, children: [run(line)] }));
    }
    nodes.push(new Paragraph({ children: [run("")] }));
  }

  // Тело — заголовок жирным по центру, остальное по ширине
  let titleHandled = false;
  for (const line of (body || opts.text).split("\n")) {
    const trimmed = line.trim();
    if (!titleHandled && isTitleLine(trimmed)) {
      nodes.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 120 },
          children: [run(trimmed, { bold: true, size: sizeHalfPt + 4 })],
        }),
      );
      titleHandled = true;
      continue;
    }
    if (!titleHandled) {
      nodes.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(trimmed, { italics: true })] }));
      continue;
    }
    nodes.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 }, children: [run(line)] }));
  }

  // Таблицы — после тела
  const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };
  for (const t of opts.tables || []) {
    if (!t.rows.length) continue;
    nodes.push(new Paragraph({ children: [run("")] }));
    nodes.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: t.rows.map((cells, ri) =>
          new TableRow({
            tableHeader: t.headerRow && ri === 0,
            children: cells.map((c) =>
              new TableCell({
                borders: cellBorders,
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: [new Paragraph({ children: [run(c, t.headerRow && ri === 0 ? { bold: true } : {})] })],
              }),
            ),
          }),
        ),
      }),
    );
  }

  const doc = new Document({
    creator: "nepriziv.ru",
    title: opts.title,
    sections: [
      {
        properties: {
          page: {
            size: { orientation: format.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 },
          },
        },
        children: nodes,
      },
    ],
  });

  return Packer.toBlob(doc);
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60).trim() || "Документ";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDocx(opts: {
  title: string;
  text: string;
  tables?: DocTable[];
  format: DocFormat;
}): Promise<void> {
  const blob = await buildDocxBlob(opts);
  downloadBlob(blob, `${safeFileName(opts.title)}.docx`);
}

// ── Печать / PDF через браузер (кириллица корректна) ─────────────────────────
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildPrintHtml(opts: { title: string; text: string; tables?: DocTable[]; format: DocFormat }): string {
  const { format } = opts;
  const { header, body } = splitHeaderBody(opts.text);

  const headerHtml = header
    ? `<div class="hdr">${escapeHtml(header).replace(/\n/g, "<br>")}</div>`
    : "";

  const bodyLines = (body || opts.text).split("\n");
  let titleHandled = false;
  const bodyHtml = bodyLines
    .map((line) => {
      const trimmed = line.trim();
      if (!titleHandled && isTitleLine(trimmed)) {
        titleHandled = true;
        return `<p class="title">${escapeHtml(trimmed)}</p>`;
      }
      if (!titleHandled) return `<p class="subtitle">${escapeHtml(trimmed)}</p>`;
      return `<p class="body">${escapeHtml(line) || "&nbsp;"}</p>`;
    })
    .join("");

  const tablesHtml = (opts.tables || [])
    .filter((t) => t.rows.length)
    .map(
      (t) =>
        `<table>${t.rows
          .map(
            (cells, ri) =>
              `<tr>${cells
                .map((c) => (t.headerRow && ri === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`))
                .join("")}</tr>`,
          )
          .join("")}</table>`,
    )
    .join("");

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
<style>
  @page { size: A4 ${format.orientation}; margin: 2cm 2cm 2cm 3cm; }
  * { box-sizing: border-box; }
  body { font-family: "${format.fontFamily}", serif; font-size: ${format.fontSizePt}pt; color: #000; line-height: 1.4; margin: 0; }
  .hdr { text-align: right; margin-bottom: 1.5em; white-space: pre-wrap; }
  .title { text-align: center; font-weight: bold; font-size: ${format.fontSizePt + 2}pt; margin: 0.8em 0 0.2em; }
  .subtitle { text-align: center; font-style: italic; margin: 0 0 0.8em; }
  .body { text-align: justify; margin: 0 0 0.5em; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  th, td { border: 1px solid #000; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { font-weight: bold; }
  @media screen { body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; } }
</style></head><body>${headerHtml}${bodyHtml}${tablesHtml}</body></html>`;
}

export function printDoc(opts: { title: string; text: string; tables?: DocTable[]; format: DocFormat }): void {
  const html = buildPrintHtml(opts);
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // даём браузеру дорисовать перед печатью
  setTimeout(() => {
    try { w.print(); } catch { /* пользователь напечатает вручную */ }
  }, 350);
}
