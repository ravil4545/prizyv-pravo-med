// Генерация медицинского досье клиента в PDF и DOCX.
//
// Решает две задачи:
//   1) В PDF нет кириллицы → подключаем TTF-шрифт через cyrillicPdfFont.
//   2) Юристу нужно скачивать досье клиента → код общий, источник данных
//      передаётся снаружи (для клиента — свои документы, для юриста —
//      документы из medical_documents_v2 ИЛИ lawyer_client_med_docs).
//
// `docx` импортируем лениво — пакет большой, не должен попадать в основной бандл.

import { jsPDF } from "jspdf";
import { registerCyrillicFont } from "@/lib/cyrillicPdfFont";

export interface DossierDoc {
  /** Заголовок документа — title, file_name или fallback */
  title: string;
  /** Дата документа (ISO YYYY-MM-DD) или null */
  document_date: string | null;
  /** Категория годности по ИИ-анализу */
  ai_fitness_category: string | null;
  /** Короткое пояснение ИИ */
  ai_explanation: string | null;
  /** Рекомендации (массив строк или JSON, всё что есть) */
  ai_recommendations: string[] | null;
}

export interface DossierData {
  /** ФИО пациента (если есть) */
  fullName?: string | null;
  /** Год рождения, если знаем */
  birthYear?: number | null;
  /** Город / адрес */
  city?: string | null;
  /** Телефон */
  phone?: string | null;
  /** Email */
  email?: string | null;
  /** Указанный/ожидаемый диагноз */
  diagnosis?: string | null;
  /** Ожидаемая категория годности */
  expectedCategory?: string | null;
  /** Документы (отсортированы как нужно — функция не пересортирует) */
  documents: DossierDoc[];
  /** Кто формирует досье: «client» (сам пациент) или «lawyer» (юрист) */
  generatedBy?: "client" | "lawyer";
  /** Имя юриста — если генерит юрист, попадёт в шапку */
  lawyerName?: string | null;
}

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("ru-RU"); } catch { return "—"; }
};

const safeFileBase = (s: string): string =>
  s.replace(/[^\wа-яА-ЯёЁ\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "досье";

// ── PDF ─────────────────────────────────────────────────────────────────
// Стратегия: подгружаем кириллический шрифт ОДИН раз (с кешем в sessionStorage),
// далее весь текст рендерим doc.text() как обычно. Никаких html2canvas — bundle
// не растёт.

export const generateDossierPDF = async (data: DossierData): Promise<Blob> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Регистрируем шрифт. Если интернета нет — пробрасываем ошибку, UI покажет
  // понятный месседж и предложит экспорт в DOCX (он работает без интернета).
  await registerCyrillicFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 18;

  const ensureSpace = (lines: number, lineHeight = 5): void => {
    if (y + lines * lineHeight > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const writeLine = (text: string, options?: {
    bold?: boolean; size?: number; color?: [number, number, number]; gap?: number;
  }): void => {
    const size = options?.size ?? 10;
    doc.setFont("CyrillicPdf", options?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    if (options?.color) doc.setTextColor(...options.color);
    else doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(1, size * 0.4);
      doc.text(line, marginLeft, y);
      y += size * 0.42;
    }
    if (options?.gap) y += options.gap;
  };

  // ── Шапка ─────────────────────────────────────────────────────────────
  doc.setFont("CyrillicPdf", "bold");
  doc.setFontSize(18);
  doc.text("Медицинское досье", pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFont("CyrillicPdf", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const subline =
    data.generatedBy === "lawyer" && data.lawyerName
      ? `Сформировано юристом: ${data.lawyerName} · ${new Date().toLocaleString("ru-RU")}`
      : `Сформировано: ${new Date().toLocaleString("ru-RU")}`;
  doc.text(subline, pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setTextColor(0, 0, 0);

  // ── Профиль пациента ──────────────────────────────────────────────────
  writeLine("Пациент", { bold: true, size: 13, gap: 2 });
  if (data.fullName) writeLine(`ФИО: ${data.fullName}`);
  if (data.birthYear) writeLine(`Год рождения: ${data.birthYear}`);
  if (data.city) writeLine(`Адрес / город: ${data.city}`);
  if (data.phone) writeLine(`Телефон: ${data.phone}`);
  if (data.email) writeLine(`Email: ${data.email}`);
  if (data.diagnosis) writeLine(`Диагноз: ${data.diagnosis}`);
  if (data.expectedCategory) writeLine(`Ожидаемая категория: ${data.expectedCategory}`);
  y += 3;

  // ── Сводка по документам ──────────────────────────────────────────────
  writeLine(`Документов в досье: ${data.documents.length}`, { bold: true, size: 11, gap: 2 });

  // Распределение по категориям (B/Д/Г и т.п.)
  const byCategory: Record<string, number> = {};
  for (const d of data.documents) {
    const cat = d.ai_fitness_category?.trim();
    if (cat) byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  if (Object.keys(byCategory).length > 0) {
    const parts = Object.entries(byCategory).map(([cat, n]) => `${cat}: ${n}`).join("  |  ");
    writeLine(`Категории по ИИ: ${parts}`, { size: 9, color: [80, 80, 80] });
    y += 2;
  }

  // ── Список документов ─────────────────────────────────────────────────
  writeLine("Документы", { bold: true, size: 13, gap: 2 });
  if (data.documents.length === 0) {
    writeLine("Документов нет.", { color: [120, 120, 120] });
  } else {
    data.documents.forEach((d, i) => {
      ensureSpace(6);
      writeLine(`${i + 1}. ${d.title || "Без названия"}`, { bold: true, size: 11 });
      if (d.document_date) writeLine(`   Дата: ${formatDate(d.document_date)}`, { size: 9, color: [80, 80, 80] });
      if (d.ai_fitness_category) writeLine(`   Категория ИИ: ${d.ai_fitness_category}`, { size: 9, color: [80, 80, 80] });
      if (d.ai_explanation) writeLine(`   Заключение: ${d.ai_explanation}`, { size: 9 });
      if (d.ai_recommendations && d.ai_recommendations.length > 0) {
        writeLine("   Рекомендации:", { size: 9, color: [80, 80, 80] });
        d.ai_recommendations.forEach((r) => writeLine(`     • ${r}`, { size: 9 }));
      }
      y += 2;
    });
  }

  // ── Подвал ────────────────────────────────────────────────────────────
  ensureSpace(4);
  y = Math.max(y, pageHeight - 16);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Сформировано на nepriziv.ru. ИИ-анализ носит справочный характер и не заменяет ВВЭ.",
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" },
  );

  return doc.output("blob");
};

// ── DOCX ────────────────────────────────────────────────────────────────
// `docx` пакет — большой (~ 300 КБ gz). Импортируем динамически, чтобы он
// попал только в чанк досье и не утяжелял основной бандл.

export const generateDossierDOCX = async (data: DossierData): Promise<Blob> => {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    BorderStyle, Table, TableRow, TableCell, WidthType,
  } = docx;

  const h1 = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 36 })],
      spacing: { after: 200 },
    });

  const h2 = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 26 })],
      spacing: { before: 280, after: 140 },
    });

  const p = (text: string, opts?: { bold?: boolean; muted?: boolean; size?: number; indent?: number }) =>
    new Paragraph({
      indent: opts?.indent ? { left: opts.indent } : undefined,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text,
          bold: opts?.bold,
          color: opts?.muted ? "707070" : undefined,
          size: opts?.size ?? 22,
        }),
      ],
    });

  const muted = (text: string) =>
    new Paragraph({
      spacing: { after: 80 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, color: "888888", size: 18 })],
    });

  const bullet = (text: string) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 40 },
      children: [new TextRun({ text, size: 21 })],
    });

  const children: InstanceType<typeof Paragraph>[] = [];

  children.push(h1("Медицинское досье"));
  children.push(muted(
    data.generatedBy === "lawyer" && data.lawyerName
      ? `Сформировано юристом: ${data.lawyerName} · ${new Date().toLocaleString("ru-RU")}`
      : `Сформировано: ${new Date().toLocaleString("ru-RU")}`,
  ));

  children.push(h2("Пациент"));
  if (data.fullName) children.push(p(`ФИО: ${data.fullName}`));
  if (data.birthYear) children.push(p(`Год рождения: ${data.birthYear}`));
  if (data.city) children.push(p(`Адрес / город: ${data.city}`));
  if (data.phone) children.push(p(`Телефон: ${data.phone}`));
  if (data.email) children.push(p(`Email: ${data.email}`));
  if (data.diagnosis) children.push(p(`Диагноз: ${data.diagnosis}`));
  if (data.expectedCategory) children.push(p(`Ожидаемая категория: ${data.expectedCategory}`));

  children.push(h2("Сводка"));
  children.push(p(`Документов: ${data.documents.length}`, { bold: true }));

  const byCategory: Record<string, number> = {};
  for (const d of data.documents) {
    const cat = d.ai_fitness_category?.trim();
    if (cat) byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  if (Object.keys(byCategory).length > 0) {
    const parts = Object.entries(byCategory).map(([cat, n]) => `${cat}: ${n}`).join("  |  ");
    children.push(p(`Категории по ИИ: ${parts}`, { muted: true }));
  }

  children.push(h2("Документы"));
  if (data.documents.length === 0) {
    children.push(p("Документов нет.", { muted: true }));
  } else {
    data.documents.forEach((d, i) => {
      children.push(p(`${i + 1}. ${d.title || "Без названия"}`, { bold: true, size: 24 }));
      if (d.document_date) children.push(p(`Дата: ${formatDate(d.document_date)}`, { muted: true, indent: 360 }));
      if (d.ai_fitness_category) children.push(p(`Категория ИИ: ${d.ai_fitness_category}`, { muted: true, indent: 360 }));
      if (d.ai_explanation) children.push(p(`Заключение: ${d.ai_explanation}`, { indent: 360 }));
      if (d.ai_recommendations && d.ai_recommendations.length > 0) {
        children.push(p("Рекомендации:", { muted: true, indent: 360 }));
        d.ai_recommendations.forEach((r) => children.push(bullet(r)));
      }
    });
  }

  children.push(muted("Сформировано на nepriziv.ru. ИИ-анализ носит справочный характер и не заменяет ВВЭ."));

  const document = new Document({
    creator: data.generatedBy === "lawyer" ? data.lawyerName || "nepriziv.ru" : "nepriziv.ru",
    title: "Медицинское досье",
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 720 } } },
        children,
      },
    ],
  });

  return await Packer.toBlob(document);
};

// ── Сохранение Blob как файла ──────────────────────────────────────────
export const downloadDossier = (
  blob: Blob,
  data: DossierData,
  format: "pdf" | "docx",
): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const name = data.fullName || "пациент";
  const date = new Date().toISOString().slice(0, 10);
  link.download = `Досье_${safeFileBase(name)}_${date}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Браузер успевает скачать до revoke — но 1s страховка не помешает
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
