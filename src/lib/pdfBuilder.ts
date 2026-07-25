// ════════════════════════════════════════════════════════════════════════
//  Экспорт документа шаблонизатора в PDF (§5 предложения).
//
//  Раньше PDF получался только через «Печать → Сохранить как PDF». Это рабочий
//  путь, и в docxBuilder он выбран сознательно (jsPDF без встроенного TTF
//  калечит кириллицу). Но с тех пор в проекте появился lib/cyrillicPdfFont —
//  он подгружает и регистрирует настоящий кириллический TTF, и им уже
//  пользуется генератор досье. Значит препятствие снято.
//
//  Зачем отдельная кнопка, если печать работает: диалог печати у каждого
//  браузера свой, на мобильных его часто нет вовсе, а колонтитулы браузера
//  норовят попасть в документ. Для бумаги, которую несут в военкомат, файл
//  предсказуемее.
//
//  jsPDF и шрифт грузятся ЛЕНИВО — только при нажатии, чтобы не тащить
//  ~400 КБ в основной бандл.
// ════════════════════════════════════════════════════════════════════════

import { downloadBlob, isTitleLine, type DocFormat, type DocTable } from "./docxBuilder";

/** Поля страницы по ГОСТ Р 7.0.97 для документов на A4, мм. */
const MARGIN = { left: 30, right: 15, top: 20, bottom: 20 };

/** Перевод пунктов в миллиметры (1 pt = 1/72 дюйма). */
const ptToMm = (pt: number): number => (pt * 25.4) / 72;

export async function buildPdfBlob(opts: {
  title: string;
  text: string;
  tables?: DocTable[];
  format: DocFormat;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { registerCyrillicFont } = await import("./cyrillicPdfFont");

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: opts.format.orientation === "landscape" ? "landscape" : "portrait",
  });

  const family = await registerCyrillicFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN.left - MARGIN.right;

  const fontSize = opts.format.fontSizePt || 12;
  // Межстрочный интервал 1.5 — как принято в документах для госорганов.
  const lineHeight = ptToMm(fontSize) * 1.5;

  let y = MARGIN.top;

  const newPageIfNeeded = (needed = lineHeight): void => {
    if (y + needed > pageHeight - MARGIN.bottom) {
      doc.addPage();
      y = MARGIN.top;
    }
  };

  const writeParagraph = (
    text: string,
    o: { bold?: boolean; align?: "left" | "center" | "right"; indent?: number } = {},
  ): void => {
    doc.setFont(family, o.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);

    const indent = o.indent ?? 0;
    const width = contentWidth - indent;
    const lines: string[] = doc.splitTextToSize(text, width);

    for (const line of lines) {
      newPageIfNeeded();
      const x = o.align === "center"
        ? pageWidth / 2
        : o.align === "right"
        ? pageWidth - MARGIN.right
        : MARGIN.left + indent;
      doc.text(line, x, y, { align: o.align ?? "left" });
      y += lineHeight;
    }
  };

  // ── Текст документа ───────────────────────────────────────────────────
  // Пустая строка исходника = отбивка абзаца, а не пустая строка текста:
  // иначе шапка «В военкомат / от кого» расползается на полстраницы.
  for (const rawLine of opts.text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      newPageIfNeeded(lineHeight / 2);
      y += lineHeight / 2;
      continue;
    }
    // Заголовок документа («ЗАЯВЛЕНИЕ», «ЖАЛОБА») — по центру и полужирным,
    // ровно как в DOCX-версии, чтобы файлы не отличались.
    if (isTitleLine(line)) {
      y += lineHeight / 2;
      writeParagraph(line.trim(), { bold: true, align: "center" });
      continue;
    }
    writeParagraph(line);
  }

  // ── Таблицы ───────────────────────────────────────────────────────────
  for (const table of opts.tables ?? []) {
    if (!table.rows?.length) continue;
    y += lineHeight / 2;

    const colCount = Math.max(...table.rows.map((r) => r.length));
    const colWidth = contentWidth / Math.max(1, colCount);

    for (const [rowIndex, row] of table.rows.entries()) {
      const isHeader = table.headerRow && rowIndex === 0;
      doc.setFont(family, isHeader ? "bold" : "normal");
      doc.setFontSize(fontSize - 1);

      // Высота строки определяется самой «многострочной» ячейкой.
      const cells = Array.from({ length: colCount }, (_, i) =>
        doc.splitTextToSize(String(row[i] ?? ""), colWidth - 4) as string[]);
      const rowLines = Math.max(1, ...cells.map((c) => c.length));
      const rowHeight = rowLines * lineHeight * 0.85 + 2;

      newPageIfNeeded(rowHeight);

      cells.forEach((cellLines, i) => {
        const x = MARGIN.left + i * colWidth;
        doc.rect(x, y - lineHeight * 0.7, colWidth, rowHeight);
        cellLines.forEach((cl, li) => {
          doc.text(cl, x + 2, y + li * lineHeight * 0.85);
        });
      });

      y += rowHeight;
    }
    y += lineHeight / 2;
  }

  return doc.output("blob");
}

function safeFileName(s: string): string {
  return (s || "document").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 120) || "document";
}

export async function downloadPdf(opts: {
  title: string;
  text: string;
  tables?: DocTable[];
  format: DocFormat;
}): Promise<void> {
  const blob = await buildPdfBlob(opts);
  downloadBlob(blob, `${safeFileName(opts.title)}.pdf`);
}
