import { jsPDF } from "jspdf";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
} from "docx";

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

export interface Template {
  key: string;
  category: string;
  title: string;
  description: string;
  isPro: boolean;
  fields: TemplateField[];
  body: (fields: Record<string, string>) => string;
}

export const TEMPLATES: Template[] = [
  {
    key: "attach_docs",
    category: "Военкомат",
    title: "Заявление о приобщении медицинских документов",
    description: "Заявление для подачи в отдел делопроизводства военкомата. Регистрируется в 2-х экземплярах.",
    isPro: false,
    fields: [
      { key: "commissar_name", label: "ФИО военного комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Наименование военкомата", placeholder: "Военкомат г. Москвы ЦАО" },
      { key: "client_name", label: "ФИО заявителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес регистрации", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "docs_list", label: "Перечень прилагаемых документов", placeholder: "1. Выписка из истории болезни...\n2. Заключение врача-специалиста...", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
проживающего по адресу: ${f.client_address},
тел.: ${f.client_phone}

ЗАЯВЛЕНИЕ
о приобщении медицинских документов к личному делу призывника

Прошу Вас приобщить к моему личному делу призывника прилагаемые медицинские документы, подтверждающие наличие у меня заболевания, являющегося основанием для присвоения категории годности в соответствии с Расписанием болезней (Приложение к Положению о военно-врачебной экспертизе, утверждённому Постановлением Правительства РФ № 565).

Перечень прилагаемых документов:
${f.docs_list}

Прошу рассмотреть данные документы при проведении медицинского освидетельствования.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "appeal_commission",
    category: "Обжалование",
    title: "Жалоба на решение призывной комиссии",
    description: "Жалоба в призывную комиссию субъекта РФ. Рассматривается в течение 5 рабочих дней.",
    isPro: false,
    fields: [
      { key: "region", label: "Субъект РФ", placeholder: "г. Москвы" },
      { key: "client_name", label: "ФИО заявителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "decision_date", label: "Дата решения комиссии", placeholder: "20.05.2026" },
      { key: "decision_content", label: "Суть обжалуемого решения", placeholder: "Признан годным к военной службе (категория А)..." },
      { key: "arguments", label: "Доводы жалобы", placeholder: "Считаю данное решение незаконным, поскольку...", multiline: true },
      { key: "request", label: "Просительная часть", placeholder: "Прошу отменить решение призывной комиссии и направить меня на дополнительное медицинское освидетельствование." },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `В призывную комиссию ${f.region}

от ${f.client_name},
адрес: ${f.client_address},
тел.: ${f.client_phone}

ЖАЛОБА
на решение призывной комиссии

${f.decision_date} призывной комиссией было принято следующее решение: ${f.decision_content}

С данным решением я не согласен по следующим основаниям:

${f.arguments}

На основании ст. 28 Федерального закона «О воинской обязанности и военной службе», главы 22 КАС РФ —

ПРОШУ:

${f.request}

Приложения: медицинские документы согласно описи.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "additional_exam",
    category: "Военкомат",
    title: "Ходатайство о направлении на дополнительное обследование",
    description: "Подаётся в военкомат при несогласии с заключением врача-специалиста.",
    isPro: false,
    fields: [
      { key: "commissar_name", label: "ФИО военного комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Военкомат", placeholder: "Военкомат г. Москвы ЦАО" },
      { key: "client_name", label: "ФИО", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "diagnosis", label: "Диагноз", placeholder: "Остеохондроз шейного отдела позвоночника..." },
      { key: "exam_requested", label: "Запрашиваемые обследования", placeholder: "МРТ шейного отдела позвоночника, консультация врача-невролога...", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
адрес: ${f.client_address}

ХОДАТАЙСТВО
о направлении на дополнительное медицинское обследование

В связи с наличием у меня заболевания — ${f.diagnosis} — прошу направить меня на дополнительное медицинское обследование для уточнения диагноза и определения степени функциональных нарушений в целях правильного применения Расписания болезней (ПП РФ № 565).

Прошу назначить следующие обследования:
${f.exam_requested}

Результаты обследований будут представлены в военкомат для приобщения к личному делу.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "medical_records_request",
    category: "Медицина",
    title: "Запрос медицинских документов из поликлиники",
    description: "Запрос на выдачу выписки из истории болезни или медицинских заключений.",
    isPro: true,
    fields: [
      { key: "clinic_name", label: "Наименование медорганизации", placeholder: "ГБУЗ ГП № 5 ДЗМ" },
      { key: "chief_doctor", label: "ФИО главного врача", placeholder: "Главному врачу" },
      { key: "client_name", label: "ФИО пациента", placeholder: "Петров Пётр Петрович" },
      { key: "birth_date", label: "Дата рождения", placeholder: "01.01.2005" },
      { key: "policy", label: "Полис ОМС", placeholder: "1234 5678 9012 3456" },
      { key: "docs_requested", label: "Запрашиваемые документы", placeholder: "Выписку из амбулаторной карты за период 2023–2026 гг....", multiline: true },
      { key: "purpose", label: "Цель запроса", placeholder: "для представления в военную комиссию" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Главному врачу ${f.clinic_name}
${f.chief_doctor}

от пациента ${f.client_name},
дата рождения: ${f.birth_date},
полис ОМС: ${f.policy}

ЗАЯВЛЕНИЕ
о выдаче медицинских документов

В соответствии со ст. 22 Федерального закона от 21.11.2011 № 323-ФЗ «Об основах охраны здоровья граждан в Российской Федерации» прошу выдать мне следующие документы:

${f.docs_requested}

Документы необходимы ${f.purpose}.

Прошу выдать заверенные копии (оригиналы по запросу) в срок, предусмотренный законодательством.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "poa",
    category: "Юридические",
    title: "Шаблон доверенности на юриста",
    description: "Простая письменная доверенность с правом передоверия (нотариально заверять необязательно).",
    isPro: true,
    fields: [
      { key: "client_name", label: "ФИО доверителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_passport", label: "Паспорт доверителя", placeholder: "серия 4515 № 123456, выдан..." },
      { key: "client_address", label: "Адрес доверителя", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "lawyer_name", label: "ФИО представителя", placeholder: "Сидоров Сидор Сидорович" },
      { key: "lawyer_passport", label: "Паспорт представителя", placeholder: "серия 4515 № 654321, выдан..." },
      { key: "powers", label: "Полномочия", placeholder: "представлять мои интересы в военкомате, призывной комиссии, судах...", multiline: true },
      { key: "valid_until", label: "Срок действия", placeholder: "31.12.2026" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `ДОВЕРЕННОСТЬ

${f.date} г.

Я, ${f.client_name}, паспорт ${f.client_passport}, проживающий по адресу: ${f.client_address}, настоящей доверенностью уполномочиваю:

${f.lawyer_name}, паспорт ${f.lawyer_passport}

${f.powers}

Доверенность выдана сроком до ${f.valid_until}. Право передоверия предоставляется.

${f.client_name} _____________
`,
  },
  {
    key: "acquaint_case",
    category: "Военкомат",
    title: "Заявление об ознакомлении с материалами личного дела",
    description: "Право на ознакомление с личным делом закреплено в ФЗ «О воинской обязанности».",
    isPro: true,
    fields: [
      { key: "commissar_name", label: "ФИО комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Военкомат", placeholder: "Военкомат г. Москвы ЦАО" },
      { key: "client_name", label: "ФИО", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
адрес: ${f.client_address},
тел.: ${f.client_phone}

ЗАЯВЛЕНИЕ
об ознакомлении с материалами личного дела призывника

На основании п. 5 ст. 5.1 Федерального закона от 28.03.1998 № 53-ФЗ «О воинской обязанности и военной службе», ст. 24 Конституции Российской Федерации прошу предоставить мне возможность ознакомиться с материалами моего личного дела призывника, а также сделать из него выписки и снять копии в разумный срок.

Прошу сообщить дату и время ознакомления.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "admin_claim",
    category: "Суд",
    title: "Административный иск об оспаривании решения призывной комиссии",
    description: "Подаётся в районный суд по месту нахождения военкомата (гл. 22 КАС РФ).",
    isPro: true,
    fields: [
      { key: "court_name", label: "Наименование суда", placeholder: "Пресненский районный суд г. Москвы" },
      { key: "client_name", label: "ФИО истца", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес истца", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "respondent", label: "Ответчик", placeholder: "Призывная комиссия муниципального образования..." },
      { key: "decision_date", label: "Дата оспариваемого решения", placeholder: "20.05.2026" },
      { key: "decision_content", label: "Суть решения", placeholder: "Признать годным, категория А..." },
      { key: "arguments", label: "Основания для оспаривания", placeholder: "Решение противоречит ПП РФ №565, ст. 66, поскольку...", multiline: true },
      { key: "request_court", label: "Требования к суду", placeholder: "Признать решение незаконным. Обязать комиссию направить на дополнительное обследование.", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `В ${f.court_name}

Административный истец: ${f.client_name}
адрес: ${f.client_address}
тел.: ${f.client_phone}

Административный ответчик: ${f.respondent}

АДМИНИСТРАТИВНОЕ ИСКОВОЕ ЗАЯВЛЕНИЕ
об оспаривании решения призывной комиссии

${f.decision_date} ${f.respondent} принято решение: ${f.decision_content}.

Считаю данное решение незаконным и необоснованным по следующим основаниям:

${f.arguments}

На основании главы 22 КАС РФ, ст. 28 ФЗ № 53-ФЗ —

ПРОШУ:
${f.request_court}

Приложения:
1. Копия оспариваемого решения
2. Медицинские документы согласно описи
3. Квитанция об уплате государственной пошлины

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "health_act",
    category: "Медицина",
    title: "Акт исследования состояния здоровья (шаблон)",
    description: "Заполняется врачом-специалистом. Шаблон для запроса у врача.",
    isPro: true,
    fields: [
      { key: "doctor_name", label: "ФИО врача", placeholder: "Смирнов А.А." },
      { key: "doctor_specialty", label: "Специальность", placeholder: "врач-невролог" },
      { key: "clinic_name", label: "Медорганизация", placeholder: "ГБУЗ ГП № 5 ДЗМ" },
      { key: "client_name", label: "ФИО пациента", placeholder: "Петров Пётр Петрович" },
      { key: "birth_date", label: "Дата рождения", placeholder: "01.01.2005" },
      { key: "diagnosis", label: "Диагноз (полный)", placeholder: "M42.0 — Остеохондроз позвоночника у взрослых, шейный отдел..." },
      { key: "functional_impairment", label: "Степень нарушения функций", placeholder: "Нарушение функции средней степени..." },
      { key: "exams_done", label: "Проведённые обследования", placeholder: "МРТ шейного отдела от 01.03.2026..." },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `АКТ
исследования состояния здоровья

${f.date}

Врач ${f.doctor_specialty} ${f.clinic_name}
${f.doctor_name}

провёл обследование гражданина: ${f.client_name}, ${f.birth_date} г.р.

ДИАГНОЗ:
${f.diagnosis}

СТЕПЕНЬ НАРУШЕНИЯ ФУНКЦИЙ:
${f.functional_impairment}

ПРОВЕДЁННЫЕ ОБСЛЕДОВАНИЯ:
${f.exams_done}

ЗАКЛЮЧЕНИЕ:
Диагноз подтверждён клинически и инструментально. Рекомендую при проведении военно-врачебной экспертизы применить соответствующую статью Расписания болезней (ПП РФ № 565).

Врач ${f.doctor_specialty}: ${f.doctor_name} _____________

М.П.
`,
  },
];

export const CATEGORIES = ["Все", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

const TITLE_MARKERS = [
  "ЗАЯВЛЕНИЕ",
  "ЖАЛОБА",
  "ХОДАТАЙСТВО",
  "АКТ",
  "ДОВЕРЕННОСТЬ",
  "АДМИНИСТРАТИВНОЕ",
];

/**
 * Делит body на «шапку» (адресат + от-кого) и «основное тело» (заголовок и далее).
 * Шапкой считается всё ДО первой строки, которая начинается с одного из TITLE_MARKERS
 * (в верхнем регистре). Если маркер не найден — шапки нет, всё это тело.
 */
export function splitHeaderAndBody(text: string): { header: string; body: string } {
  const lines = text.split("\n");
  const titleIdx = lines.findIndex((line) => {
    const trimmed = line.trim().toUpperCase();
    return TITLE_MARKERS.some((m) => trimmed.startsWith(m));
  });
  if (titleIdx <= 0) {
    return { header: "", body: text };
  }
  // schräpfen trailing пустые строки от шапки
  let endHeader = titleIdx;
  while (endHeader > 0 && lines[endHeader - 1].trim() === "") endHeader--;
  const header = lines.slice(0, endHeader).join("\n").trim();
  const body = lines.slice(titleIdx).join("\n").trim();
  return { header, body };
}

/**
 * Today в формате DD.MM.YYYY — для авто-подстановки в поле "date".
 */
export function todayRu(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/**
 * Генерирует PDF документа: шапка (адресат + отправитель) в правом верхнем углу,
 * основное тело начинается ниже — стандарт российских заявлений/жалоб.
 *
 * jsPDF из коробки не поддерживает кириллицу хорошо, но строка с шрифтом
 * helvetica всё же отрисуется ASCII-fallback'ом — для production желателен
 * embedded TTF (PT Sans/Roboto), но для MVP оставляем как есть.
 */
export function generateTemplatePdf(template: Template, fields: Record<string, string>): jsPDF {
  const text = template.body(fields);
  const { header, body } = splitHeaderAndBody(text);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica");
  doc.setFontSize(11);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Шапка — в правый верхний угол с правым выравниванием
  let bodyStartY = margin;
  if (header) {
    const headerWidth = 90; // ~45% ширины страницы под шапку
    const headerX = pageWidth - margin; // правый край
    const headerLines = doc.splitTextToSize(header, headerWidth);
    let hy = margin;
    headerLines.forEach((line: string) => {
      doc.text(line, headerX, hy, { align: "right" });
      hy += 5.5;
    });
    bodyStartY = hy + 8; // отступ под шапкой
  }

  // Основное тело — слева, на всю ширину
  const bodyLines = doc.splitTextToSize(body || text, contentWidth);
  let y = bodyStartY;
  bodyLines.forEach((line: string) => {
    if (y > 280) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 6;
  });

  return doc;
}

/**
 * Генерирует DOCX-файл (Blob) с шапкой в правом верхнем углу и телом слева.
 * Кириллица в .docx работает «из коробки» — в отличие от jsPDF, не нужны
 * embedded шрифты, Word и LibreOffice сами рендерят правильно.
 *
 * Возвращает Promise<Blob>, который можно скачать через URL.createObjectURL.
 */
export async function generateTemplateDocx(
  template: Template,
  fields: Record<string, string>,
): Promise<Blob> {
  const text = template.body(fields);
  const { header, body } = splitHeaderAndBody(text);

  const headerParagraphs: Paragraph[] = header
    ? header.split("\n").map(
        (line) =>
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 60 },
            children: [new TextRun({ text: line, size: 22 })], // 11pt
          }),
      )
    : [];

  // Если шапка есть — добавим разделитель (пустую строку)
  if (headerParagraphs.length > 0) {
    headerParagraphs.push(
      new Paragraph({ children: [new TextRun({ text: "", size: 22 })] }),
    );
  }

  // Тело: первая строка — заголовок (выделяем bold + center), остальное — обычный текст
  const bodyLines = (body || text).split("\n");

  const bodyParagraphs: Paragraph[] = [];
  let titleHandled = false;

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!titleHandled && TITLE_MARKERS.some((m) => trimmed.toUpperCase().startsWith(m))) {
      // Заголовок документа — bold + center + крупнее
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: trimmed, bold: true, size: 28 })], // 14pt
        }),
      );
      titleHandled = true;
      continue;
    }
    if (!titleHandled) {
      // Подзаголовок (вторая строка после ЗАЯВЛЕНИЕ типа) — центрируем
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: trimmed, italics: true, size: 22 })],
        }),
      );
      continue;
    }
    // Обычные строки тела
    bodyParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 80 },
        children: [new TextRun({ text: line, size: 22 })],
      }),
    );
  }

  const doc = new Document({
    creator: "nepriziv.ru",
    title: template.title,
    description: template.description,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 }, // ~3см лево, 2см право/верх/низ
          },
        },
        children: [...headerParagraphs, ...bodyParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

/**
 * Скачивает DOCX в браузере. Имя файла на основе шаблона + текущей даты.
 */
export async function downloadTemplateDocx(
  template: Template,
  fields: Record<string, string>,
): Promise<void> {
  const blob = await generateTemplateDocx(template, fields);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Заменяем недопустимые в Windows символы на нижнее подчёркивание
  const safeTitle = template.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  a.download = `${safeTitle} — ${todayRu()}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Маппинг ключей шаблона на поля lawyer_clients/profile — для авто-подстановки
 * в карточке клиента.
 */
export interface ClientPrefillSource {
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  client_birth_year?: number | null;
  conscription_date?: string | null;
  diagnosis?: string | null;
  expected_category?: string | null;
  /** Адрес из profiles.registration_address */
  client_address?: string | null;
}

const formatDateRu = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

/**
 * Возвращает значения полей шаблона, автозаполненные из данных клиента.
 * Поля, для которых нет данных в источнике — остаются пустыми.
 */
export function prefillFromClient(template: Template, source: ClientPrefillSource): Record<string, string> {
  const today = todayRu();
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    switch (f.key) {
      case "client_name":
        out[f.key] = source.client_name || "";
        break;
      case "client_phone":
        out[f.key] = source.client_phone || "";
        break;
      case "client_email":
        out[f.key] = source.client_email || "";
        break;
      case "client_address":
        out[f.key] = source.client_address || "";
        break;
      case "birth_date":
        out[f.key] = source.client_birth_year ? `01.01.${source.client_birth_year}` : "";
        break;
      case "diagnosis":
        out[f.key] = source.diagnosis || "";
        break;
      case "decision_date":
        out[f.key] = formatDateRu(source.conscription_date);
        break;
      case "date":
        out[f.key] = today;
        break;
      default:
        out[f.key] = "";
    }
  }
  return out;
}
