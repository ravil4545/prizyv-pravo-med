/// <reference lib="deno.ns" />
// Тесты условных блоков в шаблонах. Запуск: deno test tests/
//
// Проверяется именно то, что в юридическом документе стоит дорого: пустое поле
// не должно тянуть за собой абзац, а сломанный шаблон не должен молча съедать
// текст.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  expandBlocks,
  extractBlockKeys,
  hasBlocks,
  isFilled,
  tidyBlankLines,
  toListItems,
} from "../src/lib/templateLogic.ts";

Deno.test("if: заполненное поле раскрывает блок", () => {
  const out = expandBlocks("A\n{{#if org}}Учусь в {{org}}.{{/if}}\nB", { org: "МГУ" });
  // Токен {{org}} остаётся — его подставляет renderTemplate следующим шагом.
  assertEquals(out, "A\nУчусь в {{org}}.\nB");
});

Deno.test("if: пустое поле убирает блок целиком", () => {
  const out = expandBlocks("A\n{{#if org}}Учусь в {{org}}.{{/if}}\nB", { org: "   " });
  assertEquals(out, "A\n\nB");
});

Deno.test("if: отсутствующий ключ — тоже пусто, без падения", () => {
  const out = expandBlocks("{{#if nope}}текст{{/if}}X", {});
  assertEquals(out, "X");
});

Deno.test("unless: работает зеркально if", () => {
  const filled = expandBlocks("{{#unless docs}}Нет документов{{/unless}}", { docs: "есть" });
  assertEquals(filled.trim(), "");
  const empty = expandBlocks("{{#unless docs}}Нет документов{{/unless}}", { docs: "" });
  assertEquals(empty.trim(), "Нет документов");
});

Deno.test("each: нумерует построчно", () => {
  const out = expandBlocks("{{#each docs}}{{@index}}. {{this}}{{/each}}", {
    docs: "Справка от 01.01\nВыписка 027/у\n\nЗаключение ортопеда",
  });
  assertEquals(out, "1. Справка от 01.01\n2. Выписка 027/у\n3. Заключение ортопеда");
});

Deno.test("each: пустой список не оставляет мусора", () => {
  const out = expandBlocks("Приложения:\n{{#each docs}}{{@index}}. {{this}}{{/each}}", { docs: "" });
  assertEquals(out, "Приложения:\n");
});

Deno.test("вложенные блоки раскрываются корректно", () => {
  const tpl = "{{#if a}}A{{#if b}}B{{/if}}{{/if}}";
  assertEquals(expandBlocks(tpl, { a: "1", b: "1" }).trim(), "AB");
  assertEquals(expandBlocks(tpl, { a: "1", b: "" }).trim(), "A");
  assertEquals(expandBlocks(tpl, { a: "", b: "1" }).trim(), "");
});

Deno.test("несколько блоков подряд не мешают друг другу", () => {
  const tpl = "{{#if a}}РАЗ{{/if}}\n{{#if b}}ДВА{{/if}}\n{{#if c}}ТРИ{{/if}}";
  assertEquals(expandBlocks(tpl, { a: "x", b: "", c: "x" }).trim(), "РАЗ\n\nТРИ");
});

Deno.test("незакрытый блок остаётся текстом, а не съедает документ", () => {
  // Автор шаблона должен УВИДЕТЬ ошибку, а не потерять абзац.
  const tpl = "Начало\n{{#if org}}Хвост без закрытия\nКонец";
  const out = expandBlocks(tpl, { org: "МГУ" });
  assertEquals(out.includes("Конец"), true);
  assertEquals(out.includes("{{#if org}}"), true);
});

Deno.test("«0» считается заполненным значением", () => {
  // Юридический документ не должен зависеть от JS-приведения типов.
  assertEquals(isFilled("0"), true);
  assertEquals(isFilled(""), false);
  assertEquals(isFilled("  \t "), false);
  assertEquals(isFilled(undefined), false);
});

Deno.test("toListItems режет по строкам и чистит пустые", () => {
  assertEquals(toListItems("a\n\n b \n"), ["a", "b"]);
  assertEquals(toListItems(""), []);
});

Deno.test("tidyBlankLines схлопывает дыры от вырезанных блоков", () => {
  assertEquals(tidyBlankLines("A\n\n\n\nB"), "A\n\nB");
  assertEquals(tidyBlankLines("   \n\nA"), "A");
  // Хвостовые переносы схлопываются до одного, а не удаляются полностью.
  assertEquals(tidyBlankLines("A\n\n\n"), "A\n");
});

Deno.test("extractBlockKeys собирает ключи из всех конструкций", () => {
  const tpl = "{{#if a}}x{{/if}}{{#unless b}}y{{/unless}}{{#each c}}z{{/each}}{{#if a}}dup{{/if}}";
  assertEquals(extractBlockKeys(tpl), ["a", "b", "c"]);
});

Deno.test("hasBlocks отличает блочный шаблон от плоского", () => {
  assertEquals(hasBlocks("{{#if a}}x{{/if}}"), true);
  assertEquals(hasBlocks("просто {{token}}"), false);
});
