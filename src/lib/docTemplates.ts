// ════════════════════════════════════════════════════════════════════════
//  Движок клиентских шаблонов документов (/dashboard/templates).
//
//  Модель: каждый шаблон — это bodyTemplate с токенами {{ключ}} + список
//  ключей полей. Значения полей автозаполняются из профиля пользователя,
//  гос-структур (find-government-structures) и медкарты. Тело редактируемо,
//  поля добавляются/удаляются. Рендер = подстановка значений в {{ключ}}.
//
//  Экспорт (DOCX/печать) — в lib/docxBuilder.ts. Здесь только данные и рендер.
// ════════════════════════════════════════════════════════════════════════

export interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  /** Подсказка-пример в инпуте. */
  placeholder?: string;
}

export interface DocTemplate {
  key: string;
  category: string;
  title: string;
  description: string;
  /** Упорядоченный список ключей полей. */
  fieldKeys: string[];
  /** Тело с токенами {{ключ}}. */
  bodyTemplate: string;
}

// ── Словарь полей: ярлык + пример. Источник истины для меток в форме и превью ──
export const FIELD_DEFS: Record<string, FieldDef> = {
  full_name: { key: "full_name", label: "ФИО", placeholder: "Петров Пётр Петрович" },
  birth_date: { key: "birth_date", label: "Дата рождения", placeholder: "01.01.2005" },
  birth_place: { key: "birth_place", label: "Место рождения", placeholder: "г. Москва" },
  phone: { key: "phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
  passport: { key: "passport", label: "Паспортные данные", placeholder: "серия 4515 № 123456, выдан...", multiline: true },
  registration_address: { key: "registration_address", label: "Адрес регистрации", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
  actual_address: { key: "actual_address", label: "Фактический адрес", placeholder: "г. Москва, ул. ..." },
  region: { key: "region", label: "Субъект РФ", placeholder: "г. Москва" },
  military_commissariat: { key: "military_commissariat", label: "Военкомат", placeholder: "Военкомат г. Москвы ЦАО", multiline: true },
  military_commissariat_address: { key: "military_commissariat_address", label: "Адрес военкомата", placeholder: "г. Москва, ул. ..." },
  commissar_name: { key: "commissar_name", label: "ФИО военного комиссара", placeholder: "Иванову И.И." },
  superior_military_commissariat: { key: "superior_military_commissariat", label: "Вышестоящий военкомат", placeholder: "Военный комиссариат г. Москвы" },
  court_name: { key: "court_name", label: "Наименование суда", placeholder: "Пресненский районный суд г. Москвы" },
  prosecutor_office: { key: "prosecutor_office", label: "Прокуратура", placeholder: "Прокуратура ЦАО г. Москвы" },
  polyclinic: { key: "polyclinic", label: "Поликлиника", placeholder: "ГБУЗ ГП № 5 ДЗМ" },
  psychoneurological_dispensary: { key: "psychoneurological_dispensary", label: "ПНД (психоневрологический диспансер)", placeholder: "ПНД № 1" },
  narcological_dispensary: { key: "narcological_dispensary", label: "Наркологический диспансер", placeholder: "НД № 1" },
  chief_doctor: { key: "chief_doctor", label: "ФИО главного врача", placeholder: "Главному врачу" },
  policy: { key: "policy", label: "Полис ОМС", placeholder: "1234 5678 9012 3456" },
  diagnosis: { key: "diagnosis", label: "Диагноз", placeholder: "Остеохондроз шейного отдела позвоночника...", multiline: true },
  docs_list: { key: "docs_list", label: "Перечень прилагаемых документов", placeholder: "1. Выписка из истории болезни...\n2. Заключение врача...", multiline: true },
  decision_date: { key: "decision_date", label: "Дата решения комиссии", placeholder: "20.05.2026" },
  decision_content: { key: "decision_content", label: "Суть обжалуемого решения", placeholder: "Признан годным к военной службе (категория А)...", multiline: true },
  arguments: { key: "arguments", label: "Доводы / основания", placeholder: "Считаю решение незаконным, поскольку...", multiline: true },
  request: { key: "request", label: "Просительная часть", placeholder: "Прошу отменить решение и направить на доп. обследование.", multiline: true },
  request_court: { key: "request_court", label: "Требования к суду", placeholder: "Признать решение незаконным. Обязать...", multiline: true },
  respondent: { key: "respondent", label: "Административный ответчик", placeholder: "Призывная комиссия муниципального образования..." },
  exam_requested: { key: "exam_requested", label: "Запрашиваемые обследования", placeholder: "МРТ шейного отдела, консультация невролога...", multiline: true },
  docs_requested: { key: "docs_requested", label: "Запрашиваемые документы", placeholder: "Выписку из амбулаторной карты за 2023–2026 гг....", multiline: true },
  purpose: { key: "purpose", label: "Цель запроса", placeholder: "для представления в призывную комиссию" },
  representative_name: { key: "representative_name", label: "ФИО представителя", placeholder: "Сидоров Сидор Сидорович" },
  representative_passport: { key: "representative_passport", label: "Паспорт представителя", placeholder: "серия 4515 № 654321, выдан..." },
  powers: { key: "powers", label: "Полномочия", placeholder: "представлять мои интересы в военкомате, комиссии, судах...", multiline: true },
  valid_until: { key: "valid_until", label: "Срок действия", placeholder: "31.12.2026" },
  today: { key: "today", label: "Дата документа", placeholder: "01.06.2026" },
};

/** Метка поля (с безопасным фолбэком на ключ). */
export function fieldLabel(key: string): string {
  return FIELD_DEFS[key]?.label || key;
}

// ── Дата в формате DD.MM.YYYY ───────────────────────────────────────────────
export function todayRu(now: Date = new Date()): string {
  return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
}

export function formatDateRu(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return todayRu(d);
}

// ── Автозаполнение из профиля + гос-структур ────────────────────────────────
export interface FillContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- профиль из БД без сгенерированного типа здесь
  profile?: Record<string, any> | null;
  /** suggestions из find-government-structures (перекрывают профиль). */
  gov?: Record<string, string> | null;
  today?: string;
}

function buildPassport(p: Record<string, unknown> | null | undefined): string {
  if (!p) return "";
  const parts: string[] = [];
  const series = (p.passport_series as string) || "";
  const number = (p.passport_number as string) || "";
  if (series || number) parts.push(`серия ${series} № ${number}`.replace(/\s+/g, " ").trim());
  if (p.passport_issued_by) parts.push(`выдан ${p.passport_issued_by}`);
  if (p.passport_issue_date) parts.push(`от ${formatDateRu(p.passport_issue_date as string)}`);
  if (p.passport_code) parts.push(`код подразделения ${p.passport_code}`);
  return parts.join(", ");
}

/** Автозаполненное значение для ключа поля (пустая строка, если данных нет). */
export function autofillValue(key: string, ctx: FillContext): string {
  const p = ctx.profile || {};
  const g = ctx.gov || {};
  const pick = (govKey: string, profKey?: string): string =>
    (g[govKey] as string) || (profKey ? ((p[profKey] as string) || "") : "");

  switch (key) {
    case "full_name": return (p.full_name as string) || "";
    case "birth_date": return formatDateRu(p.birth_date as string);
    case "birth_place": return (p.birth_place as string) || "";
    case "phone": return (p.phone as string) || "";
    case "passport": return buildPassport(p);
    case "registration_address": return (p.registration_address as string) || (p.actual_address as string) || "";
    case "actual_address": return (p.actual_address as string) || "";
    case "region": return (p.region as string) || (p.city as string) || "";
    case "military_commissariat": return pick("military_commissariat", "military_commissariat");
    case "military_commissariat_address": return pick("military_commissariat_address", "military_commissariat_address");
    case "superior_military_commissariat": return pick("superior_military_commissariat", "superior_military_commissariat");
    case "court_name": return pick("court_by_military", "court_by_military") || pick("court_by_registration", "court_by_registration");
    case "prosecutor_office": return pick("prosecutor_office", "prosecutor_office");
    case "polyclinic": return (g.polyclinic as string) || "";
    case "psychoneurological_dispensary": return (g.psychoneurological_dispensary as string) || "";
    case "narcological_dispensary": return (g.narcological_dispensary as string) || "";
    case "today": return ctx.today || todayRu();
    default: return "";
  }
}

/** Заполняет значения всех полей шаблона из контекста (без перезаписи уже введённого). */
export function autofillTemplate(
  template: DocTemplate,
  ctx: FillContext,
  existing: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...existing };
  for (const key of template.fieldKeys) {
    const current = out[key];
    if (current && current.trim()) continue; // не затираем введённое вручную
    const v = autofillValue(key, ctx);
    if (v) out[key] = v;
  }
  return out;
}

// ── Рендер тела: {{ключ}} → значение (или [Метка], если пусто) ──────────────
const TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderTemplate(bodyTemplate: string, values: Record<string, string>): string {
  return bodyTemplate.replace(TOKEN_RE, (_, key: string) => {
    const v = values[key];
    if (v != null && String(v).trim() !== "") return String(v);
    return `[${fieldLabel(key)}]`;
  });
}

/** Извлекает уникальные ключи токенов {{...}} из текста (для редактируемого тела). */
export function extractTokens(bodyTemplate: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(bodyTemplate)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// ── Каталог шаблонов (юридически выверенные тела, токены {{...}}) ────────────
export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: "attach_docs",
    category: "Военкомат",
    title: "Заявление о приобщении медицинских документов",
    description: "Подаётся в отдел делопроизводства военкомата, регистрируется в 2-х экземплярах.",
    fieldKeys: ["military_commissariat", "commissar_name", "full_name", "registration_address", "phone", "docs_list", "today"],
    bodyTemplate: `Военному комиссару {{military_commissariat}}
{{commissar_name}}

от {{full_name}},
проживающего по адресу: {{registration_address}},
тел.: {{phone}}

ЗАЯВЛЕНИЕ
о приобщении медицинских документов к личному делу призывника

Прошу приобщить к моему личному делу призывника прилагаемые медицинские документы, подтверждающие наличие у меня заболевания, являющегося основанием для определения категории годности в соответствии с Расписанием болезней (приложение к Положению о военно-врачебной экспертизе, утверждённому Постановлением Правительства РФ № 565).

Перечень прилагаемых документов:
{{docs_list}}

Прошу учесть данные документы при проведении медицинского освидетельствования.

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "additional_exam",
    category: "Военкомат",
    title: "Ходатайство о направлении на дополнительное обследование",
    description: "При несогласии с заключением врача-специалиста военкомата.",
    fieldKeys: ["military_commissariat", "commissar_name", "full_name", "registration_address", "diagnosis", "exam_requested", "today"],
    bodyTemplate: `Военному комиссару {{military_commissariat}}
{{commissar_name}}

от {{full_name}},
адрес: {{registration_address}}

ХОДАТАЙСТВО
о направлении на дополнительное медицинское обследование

В связи с наличием у меня заболевания — {{diagnosis}} — прошу направить меня на дополнительное медицинское обследование для уточнения диагноза и степени нарушения функций в целях правильного применения Расписания болезней (ПП РФ № 565).

Прошу назначить следующие обследования:
{{exam_requested}}

Результаты обследований будут представлены в военкомат для приобщения к личному делу.

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "acquaint_case",
    category: "Военкомат",
    title: "Заявление об ознакомлении с личным делом",
    description: "Право закреплено в ФЗ «О воинской обязанности» и ст. 24 Конституции РФ.",
    fieldKeys: ["military_commissariat", "commissar_name", "full_name", "registration_address", "phone", "today"],
    bodyTemplate: `Военному комиссару {{military_commissariat}}
{{commissar_name}}

от {{full_name}},
адрес: {{registration_address}},
тел.: {{phone}}

ЗАЯВЛЕНИЕ
об ознакомлении с материалами личного дела призывника

На основании п. 5 ст. 5.1 Федерального закона от 28.03.1998 № 53-ФЗ «О воинской обязанности и военной службе» и ст. 24 Конституции Российской Федерации прошу предоставить мне возможность ознакомиться с материалами моего личного дела призывника, а также снять с него копии и сделать выписки в разумный срок.

Прошу сообщить дату и время ознакомления.

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "appeal_commission",
    category: "Обжалование",
    title: "Жалоба на решение призывной комиссии",
    description: "В призывную комиссию субъекта РФ. Рассматривается в течение 5 рабочих дней.",
    fieldKeys: ["region", "full_name", "registration_address", "phone", "decision_date", "decision_content", "arguments", "request", "today"],
    bodyTemplate: `В призывную комиссию {{region}}

от {{full_name}},
адрес: {{registration_address}},
тел.: {{phone}}

ЖАЛОБА
на решение призывной комиссии

{{decision_date}} призывной комиссией принято решение: {{decision_content}}

С данным решением я не согласен по следующим основаниям:

{{arguments}}

На основании ст. 28 Федерального закона «О воинской обязанности и военной службе», главы 22 КАС РФ —

ПРОШУ:

{{request}}

Приложения: медицинские документы согласно описи.

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "admin_claim",
    category: "Суд",
    title: "Административный иск об оспаривании решения комиссии",
    description: "В районный суд по месту нахождения военкомата (гл. 22 КАС РФ).",
    fieldKeys: ["court_name", "full_name", "registration_address", "phone", "respondent", "decision_date", "decision_content", "arguments", "request_court", "today"],
    bodyTemplate: `В {{court_name}}

Административный истец: {{full_name}}
адрес: {{registration_address}}
тел.: {{phone}}

Административный ответчик: {{respondent}}

АДМИНИСТРАТИВНОЕ ИСКОВОЕ ЗАЯВЛЕНИЕ
об оспаривании решения призывной комиссии

{{decision_date}} {{respondent}} принято решение: {{decision_content}}.

Считаю данное решение незаконным и необоснованным по следующим основаниям:

{{arguments}}

На основании главы 22 КАС РФ, ст. 28 ФЗ № 53-ФЗ —

ПРОШУ:
{{request_court}}

Приложения:
1. Копия оспариваемого решения
2. Медицинские документы согласно описи
3. Квитанция об уплате государственной пошлины

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "medical_records_request",
    category: "Медицина",
    title: "Запрос медицинских документов из поликлиники",
    description: "Запрос выписки/заключений по ст. 22 ФЗ № 323-ФЗ.",
    fieldKeys: ["polyclinic", "chief_doctor", "full_name", "birth_date", "policy", "docs_requested", "purpose", "today"],
    bodyTemplate: `Главному врачу {{polyclinic}}
{{chief_doctor}}

от пациента {{full_name}},
дата рождения: {{birth_date}},
полис ОМС: {{policy}}

ЗАЯВЛЕНИЕ
о выдаче медицинских документов

В соответствии со ст. 22 Федерального закона от 21.11.2011 № 323-ФЗ «Об основах охраны здоровья граждан в Российской Федерации» прошу выдать мне следующие документы:

{{docs_requested}}

Документы необходимы {{purpose}}.

Прошу выдать заверенные копии в срок, предусмотренный законодательством.

{{today}}                                    {{full_name}} _____________`,
  },
  {
    key: "poa",
    category: "Юридические",
    title: "Доверенность на представителя",
    description: "Простая письменная доверенность с правом передоверия (нотариус необязателен).",
    fieldKeys: ["today", "full_name", "passport", "registration_address", "representative_name", "representative_passport", "powers", "valid_until"],
    bodyTemplate: `ДОВЕРЕННОСТЬ

{{today}} г.

Я, {{full_name}}, паспорт {{passport}}, проживающий по адресу: {{registration_address}}, настоящей доверенностью уполномочиваю:

{{representative_name}}, паспорт {{representative_passport}}

{{powers}}

Доверенность выдана сроком до {{valid_until}}. Право передоверия предоставляется.

{{full_name}} _____________`,
  },
  {
    key: "psychoneuro_request",
    category: "Медицина",
    title: "Запрос сведений из ПНД / наркодиспансера",
    description: "Запрос справки об отсутствии/наличии учёта для ВВК.",
    fieldKeys: ["psychoneurological_dispensary", "full_name", "birth_date", "registration_address", "purpose", "today"],
    bodyTemplate: `Главному врачу {{psychoneurological_dispensary}}

от {{full_name}},
дата рождения: {{birth_date}},
адрес: {{registration_address}}

ЗАЯВЛЕНИЕ
о выдаче справки

Прошу выдать мне справку о том, состою (состоял) ли я на диспансерном учёте, с указанием диагноза и периода наблюдения.

Справка необходима {{purpose}}.

Прошу выдать документ в срок, предусмотренный законодательством.

{{today}}                                    {{full_name}} _____________`,
  },
];

export const DOC_CATEGORIES = ["Все", ...Array.from(new Set(DOC_TEMPLATES.map((t) => t.category)))];

export function getTemplate(key: string): DocTemplate | undefined {
  return DOC_TEMPLATES.find((t) => t.key === key);
}
