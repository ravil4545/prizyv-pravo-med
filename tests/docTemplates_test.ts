/// <reference lib="deno.ns" />
// Интеграционная проверка шаблонов: не только движок блоков сам по себе, но и
// то, что реальный документ из каталога собирается правильно.
//
// Запуск: deno test tests/

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DOC_TEMPLATES, extractTokens, renderTemplate } from "../src/lib/docTemplates.ts";

const attachDocs = DOC_TEMPLATES.find((t) => t.key === "attach_docs")!;

Deno.test("каталог на месте и ключи уникальны", () => {
  assertEquals(DOC_TEMPLATES.length, 21);
  const keys = DOC_TEMPLATES.map((t) => t.key);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("заполненный перечень даёт заголовок «Приложения:»", () => {
  const out = renderTemplate(attachDocs.bodyTemplate, {
    full_name: "Петров Пётр Петрович",
    docs_list: "1. Выписка 027/у — 01.06.2026\n2. Заключение пульмонолога — 10.06.2026",
  });
  assertStringIncludes(out, "Приложения:");
  assertStringIncludes(out, "Выписка 027/у");
  assertStringIncludes(out, "Петров Пётр Петрович");
});

Deno.test("пустой перечень НЕ оставляет осиротевший заголовок", () => {
  // До появления {{#if}} в документ уходила строка «Приложения:» и следом
  // заглушка «[Приложения (перечень документов)]» — выглядело как недоделка.
  const out = renderTemplate(attachDocs.bodyTemplate, {
    full_name: "Петров Пётр Петрович",
    docs_list: "",
  });
  assertEquals(out.includes("Приложения:"), false);
  assertEquals(out.includes("[Приложения"), false);
});

Deno.test("незаполненные поля превращаются в понятные заглушки, а не в пустоту", () => {
  const out = renderTemplate("Кому: {{military_commissariat}}", {});
  assertStringIncludes(out, "[Военкомат (отдел воинского учёта)]");
});

Deno.test("extractTokens не отдаёт служебные переменные {{#each}}", () => {
  const tokens = extractTokens("{{#each docs_list}}{{@index}}. {{this}}{{/each}} {{full_name}}");
  assertEquals(tokens.includes("this"), false);
  assertEquals(tokens.includes("docs_list"), true, "ключ блока обязан попасть в поля формы");
  assertEquals(tokens.includes("full_name"), true);
});

Deno.test("все шаблоны каталога рендерятся без исключений", () => {
  for (const t of DOC_TEMPLATES) {
    const out = renderTemplate(t.bodyTemplate, t.defaults ?? {});
    assertEquals(typeof out, "string");
    assertEquals(out.length > 50, true, `шаблон ${t.key} собрался подозрительно коротким`);
    // Незакрытых блоков остаться не должно ни в одном документе.
    assertEquals(out.includes("{{#"), false, `в ${t.key} остался нераскрытый блок`);
    assertEquals(out.includes("{{/"), false, `в ${t.key} остался закрывающий тег`);
  }
});
