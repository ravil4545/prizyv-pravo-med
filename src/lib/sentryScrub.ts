// ════════════════════════════════════════════════════════════════════════
//  Вычистка персональных данных перед отправкой в Sentry (§8 предложения).
//
//  ПОЧЕМУ ЭТО ОБЯЗАТЕЛЬНО, а не «хорошо бы». Sentry по умолчанию складывает в
//  событие URL с query-строкой, «хлебные крошки» (включая ввод в поля),
//  тело запроса и произвольный контекст. На этом сайте всё перечисленное может
//  содержать диагноз, ФИО, паспорт и СНИЛС — специальную категорию персональных
//  данных по 152-ФЗ. Включить DSN без фильтра означает переслать медданные
//  клиентов на серверы стороннего сервиса.
//
//  Поэтому порядок именно такой: сначала фильтр, потом DSN.
//
//  Подход — «запрещено всё, что не разрешено явно»: свободный текст вычищается
//  регулярками, произвольный контекст и ввод в поля выбрасываются целиком.
//  Ошибиться в сторону меньшей диагностики здесь дешевле, чем в сторону утечки.
//
//  Модуль чистый — покрыт тестами (tests/sentryScrub_test.ts).
// ════════════════════════════════════════════════════════════════════════

/** Маркер, который видно в Sentry: понятно, что это не потеря, а вычистка. */
const MASK = "[вырезано]";

interface Rule {
  re: RegExp;
  label: string;
}

/**
 * Порядок важен: сначала самые специфичные шаблоны, иначе общий «длинный
 * набор цифр» съест телефон и СНИЛС раньше, чем они будут распознаны.
 */
const RULES: Rule[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, label: "email" },
  // Российский телефон в любом привычном написании.
  { re: /(?:\+7|\b8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, label: "телефон" },
  // СНИЛС 123-456-789 00
  { re: /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, label: "СНИЛС" },
  // Полис ОМС — 16 цифр, возможно группами по 4.
  { re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, label: "полис" },
  // Паспорт: «серия 4515 № 123456» и вариации.
  { re: /\b(?:серия\s*)?\d{2}\s?\d{2}\s*(?:№|N|номер)?\s*\d{6}\b/gi, label: "паспорт" },
  // ФИО с отчеством — тот же приём, что в ПДн-гейте ingest_rag.py.
  //
  // ВНИМАНИЕ на границы слова. В JS `\b` определён через \w = [A-Za-z0-9_],
  // то есть кириллица для него — НЕ буква, и `\b[А-ЯЁ]` не срабатывает никогда.
  // Первая версия правила с `\b` не вычищала ФИО вообще; поймано тестом.
  // Поэтому границы заданы явными lookaround'ами по кириллице.
  {
    re: /(?<![А-Яа-яЁё])[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]*(?:ович|евич|ьич|овна|евна|ична)(?![А-Яа-яЁё])/g,
    label: "ФИО",
  },
  // Дата рождения в свободном тексте.
  { re: /\b\d{2}[./]\d{2}[./]\d{4}\b/g, label: "дата" },
];

/**
 * Отрезает query и hash у ЛЮБОГО URL внутри свободного текста.
 * Нужно отдельно от scrubUrl: «хлебная крошка» навигации выглядит как
 * «переход на /ai?q=астма», то есть диагноз приезжает внутри обычной строки.
 */
function stripQueryInText(input: string): string {
  return input.replace(/((?:https?:\/\/|\/)[^\s?#]*)[?#][^\s]*/g, `$1?${MASK}`);
}

/** Вычищает ПДн из произвольной строки. */
export function scrubText(input: string): string {
  if (typeof input !== "string" || !input) return input;
  // Сначала срезаем query у встроенных URL — там свободный текст жалобы.
  let out = stripQueryInText(input);
  for (const { re, label } of RULES) {
    out = out.replace(re, `${MASK}:${label}`);
  }
  return out;
}

/**
 * URL без query и hash: и то и другое может нести данные («?q=диагноз»,
 * «?email=…»). Путь оставляем — по нему и ищут ошибку.
 */
export function scrubUrl(url: string): string {
  if (typeof url !== "string" || !url) return url;
  const cut = url.replace(/[?#].*$/, "");
  return cut === url ? url : `${cut}?${MASK}`;
}

/**
 * Категории «хлебных крошек», которые выбрасываем целиком.
 * ui.input — буквально то, что человек печатал в поле; console — часто
 * содержит выгрузки объектов с данными.
 */
const DROP_BREADCRUMB_CATEGORIES = new Set(["ui.input", "console"]);

interface SentryBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

interface SentryEventLike {
  message?: string;
  request?: { url?: string; data?: unknown; headers?: Record<string, string>; cookies?: unknown };
  breadcrumbs?: SentryBreadcrumb[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  user?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string; type?: string }> };
}

/**
 * Крошка после вычистки либо null, если её нужно выбросить.
 * Экспортируется отдельно — это beforeBreadcrumb для Sentry.
 */
export function scrubBreadcrumb(crumb: SentryBreadcrumb | null): SentryBreadcrumb | null {
  if (!crumb) return null;
  if (crumb.category && DROP_BREADCRUMB_CATEGORIES.has(crumb.category)) return null;

  const out: SentryBreadcrumb = { ...crumb };
  if (typeof out.message === "string") out.message = scrubText(out.message);

  if (out.data && typeof out.data === "object") {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      // Из данных крошки оставляем только безопасную техническую часть.
      if (["method", "status_code", "reason"].includes(k)) data[k] = v;
      else if (k === "url" && typeof v === "string") data[k] = scrubUrl(v);
    }
    out.data = data;
  }
  return out;
}

/**
 * Событие после вычистки. Это beforeSend для Sentry.
 *
 * `extra`, `cookies` и тело запроса выбрасываются ЦЕЛИКОМ: перечислить всё
 * безопасное в них невозможно, а один недосмотр = утечка диагноза.
 */
export function scrubEvent(event: SentryEventLike | null): SentryEventLike | null {
  if (!event) return null;
  const out: SentryEventLike = { ...event };

  if (typeof out.message === "string") out.message = scrubText(out.message);

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? scrubText(v.value) : v.value,
      })),
    };
  }

  if (out.request) {
    const { url, headers } = out.request;
    out.request = {
      ...(url ? { url: scrubUrl(url) } : {}),
      // Заголовки оставляем только технические: в Authorization и Cookie токены.
      ...(headers
        ? {
          headers: Object.fromEntries(
            Object.entries(headers).filter(([k]) =>
              ["content-type", "user-agent", "referer"].includes(k.toLowerCase())
            ),
          ),
        }
        : {}),
    };
  }

  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((c): c is SentryBreadcrumb => c !== null);
  }

  // Произвольный контекст не пересылаем вовсе.
  delete out.extra;

  // Из пользователя оставляем только идентификатор — ни email, ни имени.
  if (out.user) {
    out.user = out.user.id ? { id: out.user.id } : {};
  }

  return out;
}
