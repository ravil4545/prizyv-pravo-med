// ════════════════════════════════════════════════════════════════════════
//  Деньги: разбор и форматирование рублей (§6 предложения).
//
//  Суммы везде хранятся и считаются в КОПЕЙКАХ (bigint в БД, number здесь).
//  Причина простая: 0.1 + 0.2 !== 0.3, и при суммировании десятка гонораров
//  в рублях-с-плавающей-точкой итог разъезжается на копейки. Юрист такое
//  замечает, и доверия к цифрам это не добавляет.
//
//  Разделитель разрядов ставим САМИ, а не через toLocaleString: Intl отдаёт
//  для ru-RU узкий неразрывный пробел (U+202F), причём в разных версиях ICU
//  по-разному — Node, Deno и браузеры расходятся. Для сумм в документах нужен
//  предсказуемый результат, а не «как повезёт с рантаймом». Поймано тестом.
//
//  Модуль чистый — покрыт тестами (tests/money_test.ts), потому что ошибки в
//  разборе пользовательского ввода тут стоят реальных денег.
// ════════════════════════════════════════════════════════════════════════

/** Максимум — 1 млрд рублей. Защита от опечатки в лишний ноль. */
export const MAX_KOPECKS = 100_000_000_000;

/** Обычный пробел: единственный разделитель разрядов во всём проекте. */
const GROUP_SEPARATOR = " ";

/**
 * Пробелы всех сортов, которые встречаются во вводе.
 * Записаны escape-последовательностями намеренно: буквальные неразрывные
 * пробелы в исходнике глазом неотличимы от обычных — ни на ревью, ни в diff.
 *   \u00A0 — неразрывный, приходит копипастом из Word и Excel;
 *   \u202F — узкий неразрывный, его вставляет Intl как разделитель разрядов;
 *   \u2009 — тонкий, встречается в вёрстке.
 */
const ANY_SPACE = /[\s\u00A0\u202F\u2009]/g;

/** Разряды по три цифры справа: 9000000 -> «9 000 000». */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * Разбирает то, что человек реально печатает: «90000», «90 000», «90 000,50»,
 * «90000.5», «90 000 ₽». Возвращает копейки либо null, если это не сумма.
 *
 * Отдельно про запятую: в русской раскладке разделитель дробной части — она,
 * а не точка, и путать их нельзя.
 */
export function parseRublesToKopecks(input: string): number | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    // U+00A0 приходит копипастом из Word/Excel, U+202F — из Intl-форматирования.
    // Обе выглядят как пробел и обе ломают наивный разбор.
    .replace(ANY_SPACE, "")
    .replace(/₽|руб\.?|р\./gi, "")
    .replace(",", ".")
    .trim();

  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [rub, kop = ""] = cleaned.split(".");
  const kopecks = Number(rub) * 100 + Number(kop.padEnd(2, "0"));

  if (!Number.isFinite(kopecks) || kopecks < 0 || kopecks > MAX_KOPECKS) return null;
  return kopecks;
}

/**
 * «9000000» -> «90 000 ₽», «9000050» -> «90 000,50 ₽».
 * Копейки показываем ТОЛЬКО когда они есть: «90 000,00 ₽» в счёте выглядит
 * канцелярски и мешает быстро читать колонку сумм.
 */
export function formatKopecks(kopecks: number, opts: { withSign?: boolean } = {}): string {
  if (!Number.isFinite(kopecks)) return "—";
  const negative = kopecks < 0;
  const abs = Math.abs(Math.round(kopecks));

  const rub = Math.floor(abs / 100);
  const kop = abs % 100;

  const body = kop ? `${groupDigits(rub)},${String(kop).padStart(2, "0")}` : groupDigits(rub);

  const sign = negative ? "−" : opts.withSign ? "+" : "";
  return `${sign}${body} ₽`;
}

/** Компактно для сводок: «90 тыс. ₽», «1,2 млн ₽». Точность здесь не нужна. */
export function formatKopecksShort(kopecks: number): string {
  const rub = Math.round(kopecks / 100);
  if (rub >= 1_000_000) {
    const mln = rub / 1_000_000;
    return `${mln.toFixed(mln < 10 ? 1 : 0).replace(".", ",")} млн ₽`;
  }
  if (rub >= 10_000) return `${Math.round(rub / 1000)} тыс. ₽`;
  return formatKopecks(kopecks);
}

/** Значение для <input type="text">: «90000,50» без разделителей групп. */
export function kopecksToInputValue(kopecks: number): string {
  const abs = Math.abs(Math.round(kopecks));
  const kop = abs % 100;
  return kop ? `${Math.floor(abs / 100)},${String(kop).padStart(2, "0")}` : String(Math.floor(abs / 100));
}
