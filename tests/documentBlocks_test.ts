/// <reference lib="deno.ns" />
// Конструктор документа из блоков. Запуск: deno test tests/
//
// Проверяется главное: порядок частей документа задаётся правилами
// делопроизводства, а не порядком кликов, и собранный текст остаётся валидным
// шаблоном — с раскрываемыми блоками и подставляемыми токенами.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  BLOCK_LIBRARY,
  blockById,
  blocksOfKind,
  composeDocument,
  KIND_ORDER,
} from "../src/lib/documentBlocks.ts";
import { renderTemplate } from "../src/lib/docTemplates.ts";

Deno.test("библиотека блоков непустая и без дублей id", () => {
  assertEquals(BLOCK_LIBRARY.length > 20, true);
  const ids = BLOCK_LIBRARY.map((b) => b.id);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("для каждого вида части есть хотя бы один блок", () => {
  for (const kind of KIND_ORDER) {
    assertEquals(blocksOfKind(kind).length > 0, true, `нет блоков вида ${kind}`);
  }
});

Deno.test("порядок частей не зависит от порядка выбора", () => {
  // Пользователь мог отметить подпись первой — документ всё равно соберётся верно.
  const shuffled = ["sign_simple", "dem_attach", "title_statement", "addr_military"];
  const out = composeDocument(shuffled);

  const posAddr = out.indexOf("{{military_commissariat}}");
  const posTitle = out.indexOf("ЗАЯВЛЕНИЕ");
  const posDemand = out.indexOf("прошу:");
  const posSign = out.indexOf("{{today}}");

  assertEquals(posAddr < posTitle, true, "шапка должна быть выше заголовка");
  assertEquals(posTitle < posDemand, true, "заголовок выше просительной части");
  assertEquals(posDemand < posSign, true, "подпись в самом низу");
});

Deno.test("основание и просительная часть склеиваются в одно предложение", () => {
  const out = composeDocument(["gr_565", "dem_attach"]);
  assertStringIncludes(out, "Положения о военно-врачебной экспертизе (ПП РФ от 04.07.2013 № 565) прошу:");
  // Между ними не должно быть пустой строки — это одно предложение.
  assertEquals(out.includes("№ 565)\n\nпрошу:"), false);
});

Deno.test("пустой выбор даёт пустой документ, а не мусор", () => {
  assertEquals(composeDocument([]), "");
  assertEquals(composeDocument(["нет_такого_блока"]), "");
});

Deno.test("несуществующие id молча отбрасываются", () => {
  const out = composeDocument(["addr_military", "выдуманный", "title_statement"]);
  assertStringIncludes(out, "ЗАЯВЛЕНИЕ");
  assertEquals(out.includes("выдуманный"), false);
});

Deno.test("собранный документ — валидный шаблон: блоки раскрываются, токены подставляются", () => {
  const body = composeDocument([
    "addr_military", "title_statement", "facts_registered", "facts_study",
    "gr_deferment", "dem_attach", "app_list", "sign_with_accept",
  ]);

  const out = renderTemplate(body, {
    full_name: "Петров Пётр Петрович",
    military_commissariat: "Военкомат ЦАО г. Москвы",
    study_org: "МГУ им. М.В. Ломоносова",
    study_level: "бакалавриат",
    docs_list: "1. Справка об обучении",
    today: "25.07.2026",
  });

  assertStringIncludes(out, "Петров Пётр Петрович");
  assertStringIncludes(out, "Военкомат ЦАО г. Москвы");
  assertStringIncludes(out, "МГУ им. М.В. Ломоносова");
  assertStringIncludes(out, "Приложения:");
  // Нераскрытых конструкций остаться не должно.
  assertEquals(out.includes("{{#"), false);
  assertEquals(out.includes("{{/"), false);
});

Deno.test("условный блок внутри части исчезает, если поле не заполнено", () => {
  const body = composeDocument(["facts_study"]);
  const out = renderTemplate(body, { study_org: "" });
  assertEquals(out.includes("Обучаюсь"), false);
  assertEquals(out.trim(), "");
});

Deno.test("все блоки библиотеки рендерятся без нераскрытых конструкций", () => {
  for (const b of BLOCK_LIBRARY) {
    const out = renderTemplate(b.body, { docs_list: "1. Документ", study_org: "Вуз", prior_appeal: "было" });
    assertEquals(out.includes("{{#"), false, `в блоке ${b.id} остался открывающий тег`);
    assertEquals(out.includes("{{/"), false, `в блоке ${b.id} остался закрывающий тег`);
  }
});

Deno.test("правовые основания содержат конкретную норму, а не общие слова", () => {
  for (const b of blocksOfKind("grounds")) {
    const hasNorm = /(ФЗ|КАС|Закон|Конституц)/.test(b.body);
    assertEquals(hasNorm, true, `основание ${b.id} не ссылается на норму`);
    assertEquals(b.body.startsWith("На основании"), true, `${b.id}: нарушена склейка с «прошу:»`);
  }
});

Deno.test("blockById находит блок и не падает на мусоре", () => {
  assertEquals(blockById("addr_military")?.kind, "addressee");
  assertEquals(blockById("нет"), undefined);
});
