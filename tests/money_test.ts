/// <reference lib="deno.ns" />
// Деньги. Запуск: deno test tests/
//
// Проверяется то, что стоит реальных денег: разбор пользовательского ввода и
// отсутствие накопления погрешности при суммировании.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  formatKopecks,
  formatKopecksShort,
  kopecksToInputValue,
  MAX_KOPECKS,
  parseRublesToKopecks,
} from "../src/lib/money.ts";

Deno.test("разбирает то, что человек реально печатает", () => {
  assertEquals(parseRublesToKopecks("90000"), 9_000_000);
  assertEquals(parseRublesToKopecks("90 000"), 9_000_000);
  assertEquals(parseRublesToKopecks("90 000 ₽"), 9_000_000);
  assertEquals(parseRublesToKopecks("90000 руб."), 9_000_000);
  assertEquals(parseRublesToKopecks("  90000  "), 9_000_000);
});

Deno.test("запятая — разделитель дробной части, как в русской раскладке", () => {
  assertEquals(parseRublesToKopecks("90000,50"), 9_000_050);
  assertEquals(parseRublesToKopecks("90000.50"), 9_000_050);
  assertEquals(parseRublesToKopecks("0,05"), 5);
  // Одна цифра после разделителя — это десятые рубля, т.е. 50 копеек.
  assertEquals(parseRublesToKopecks("1,5"), 150);
});

Deno.test("неразрывный пробел из вставки не ломает разбор", () => {
  // Копипаст из Word/Excel приносит U+00A0 — самая частая причина «не сохраняется».
  assertEquals(parseRublesToKopecks("90 000"), 9_000_000);
});

Deno.test("мусор отвергается, а не превращается в ноль", () => {
  for (const bad of ["", "   ", "abc", "-100", "90000,555", "1e5", "90 000 долларов", "--5"]) {
    assertEquals(parseRublesToKopecks(bad), null, `«${bad}» должно быть отвергнуто`);
  }
});

Deno.test("защита от лишнего нуля", () => {
  assertEquals(parseRublesToKopecks(String(MAX_KOPECKS / 100)), MAX_KOPECKS);
  assertEquals(parseRublesToKopecks(String(MAX_KOPECKS / 100 + 1)), null);
});

Deno.test("копейки показываются только когда они есть", () => {
  assertEquals(formatKopecks(9_000_000), "90 000 ₽");
  assertEquals(formatKopecks(9_000_050), "90 000,50 ₽");
  assertEquals(formatKopecks(9_000_005), "90 000,05 ₽");
  assertEquals(formatKopecks(0), "0 ₽");
});

Deno.test("разделитель разрядов — обычный пробел, а не сюрприз от ICU", () => {
  // Intl для ru-RU отдаёт узкий неразрывный пробел (U+202F), и в разных
  // версиях ICU по-разному: Node, Deno и браузеры расходятся. Для сумм в
  // документах нужен предсказуемый символ. Именно на этом упал первый вариант.
  const out = formatKopecks(9_000_000);
  assertEquals(out, "90 000 ₽");
  assertEquals(out.includes(" "), false, "просочился узкий неразрывный пробел");
  assertEquals(out.includes(" "), false, "просочился неразрывный пробел");
});

Deno.test("суммирование в копейках не накапливает погрешность", () => {
  // В рублях-с-плавающей-точкой 0.1+0.2 !== 0.3; в копейках такого нет.
  const items = [10, 20, 30, 5, 5];            // 0,10 + 0,20 + 0,30 + 0,05 + 0,05
  const total = items.reduce((a, b) => a + b, 0);
  assertEquals(total, 70);
  assertEquals(formatKopecks(total), "0,70 ₽");

  // Сотня гонораров по 90 000,33 ₽ — итог обязан быть точным до копейки.
  const many = Array.from({ length: 100 }, () => 9_000_033);
  assertEquals(many.reduce((a, b) => a + b, 0), 900_003_300);
});

Deno.test("отрицательные суммы показываются минусом, а не ломают формат", () => {
  assertEquals(formatKopecks(-9_000_000), "−90 000 ₽");
  assertEquals(formatKopecks(9_000_000, { withSign: true }), "+90 000 ₽");
});

Deno.test("нечисло не роняет вывод", () => {
  assertEquals(formatKopecks(Number.NaN), "—");
  assertEquals(formatKopecks(Number.POSITIVE_INFINITY), "—");
});

Deno.test("короткий формат для сводок", () => {
  assertEquals(formatKopecksShort(9_000_000), "90 тыс. ₽");
  assertEquals(formatKopecksShort(150_000_000), "1,5 млн ₽");
  assertEquals(formatKopecksShort(1_200_000_000), "12 млн ₽");
  assertEquals(formatKopecksShort(500_000), "5 000 ₽");
});

Deno.test("значение для поля ввода читается обратно без потерь", () => {
  for (const k of [0, 5, 150, 9_000_000, 9_000_050, 123_456_789]) {
    assertEquals(parseRublesToKopecks(kopecksToInputValue(k)), k, `не сходится на ${k}`);
  }
});
