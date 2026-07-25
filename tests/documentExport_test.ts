/// <reference lib="deno.ns" />
// Тесты выгрузки и печати документа. Запуск: deno test tests/
//
// Главное здесь — экранирование. Название документа берётся из имени
// загруженного файла и из ответа ИИ, а окно печати собирается строкой и
// открывается на origin сайта, где в localStorage лежит сессия Supabase.
// Непроэкранированное название = выполнение чужого кода с правами человека.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildPrintHtml,
  documentFileExtension,
  safeFileName,
} from "../src/lib/documentExport.ts";
import type { MedicalDocument } from "../src/lib/medicalDocumentTypes.ts";

function doc(over: Partial<MedicalDocument>): MedicalDocument {
  return {
    id: "d1",
    title: "Выписка",
    file_url: "user/1.pdf",
    document_date: null,
    uploaded_at: "2026-01-01T00:00:00Z",
    is_classified: false,
    document_type_id: null,
    raw_text: null,
    ai_fitness_category: null,
    ai_category_chance: null,
    ai_recommendations: null,
    ai_explanation: null,
    linked_article_id: null,
    meta: null,
    ...over,
  };
}

const URL_OK = "https://storage.example/doc.jpg?token=abc";

// ── Экранирование ────────────────────────────────────────────────────────

Deno.test("скрипт в названии документа не попадает в разметку", () => {
  const html = buildPrintHtml(
    doc({ title: '<script>alert(document.cookie)</script>' }),
    URL_OK,
  );
  assertEquals(html.includes("<script>"), false, "тег script дошёл до разметки");
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("onerror-полезная нагрузка из имени файла обезврежена", () => {
  const html = buildPrintHtml(doc({ title: '<img src=x onerror=alert(1)>' }), URL_OK);
  assertEquals(html.includes("onerror=alert(1)>"), false);
  assertStringIncludes(html, "&lt;img src=x onerror=alert(1)&gt;");
});

Deno.test("кавычка в названии не разрывает атрибут alt", () => {
  const html = buildPrintHtml(doc({ title: '" onload="alert(1)' }), URL_OK);
  assertEquals(html.includes('onload="alert(1)'), false);
  // Атрибут остаётся ровно одной парой кавычек.
  const alt = html.match(/alt="([^"]*)"/);
  assertEquals(alt !== null, true, "атрибут alt разорван");
});

Deno.test("подписанная ссылка тоже экранируется", () => {
  const html = buildPrintHtml(doc({}), 'https://x/a.jpg?t=1"><script>alert(1)</script>');
  assertEquals(html.includes("<script>"), false);
});

Deno.test("амперсанд в ссылке не ломает адрес — экранируется как сущность", () => {
  const html = buildPrintHtml(doc({}), "https://x/a.jpg?token=1&expires=2");
  assertStringIncludes(html, "token=1&amp;expires=2");
});

// ── Содержимое окна печати ───────────────────────────────────────────────

Deno.test("без названия — нейтральный заголовок, без даты — нет строки даты", () => {
  const html = buildPrintHtml(doc({ title: null, document_date: null }), URL_OK);
  assertStringIncludes(html, "<title>Медицинский документ</title>");
  assertEquals(html.includes("Дата документа"), false);
});

Deno.test("дата документа выводится по-русски", () => {
  const html = buildPrintHtml(doc({ document_date: "2026-03-09" }), URL_OK);
  assertStringIncludes(html, "Дата документа: 09.03.2026");
});

Deno.test("битая дата не роняет печать и не печатает Invalid Date", () => {
  const html = buildPrintHtml(doc({ document_date: "не дата" }), URL_OK);
  assertEquals(html.includes("Invalid"), false);
  assertEquals(html.includes("Дата документа"), false);
});

// ── Имя файла ────────────────────────────────────────────────────────────

Deno.test("расширение — по фактическому файлу в хранилище", () => {
  assertEquals(documentFileExtension("u/1.PDF"), ".pdf");
  assertEquals(documentFileExtension("u/1.docx"), ".docx");
  assertEquals(documentFileExtension("u/1.png"), ".jpg");
});

Deno.test("путь в названии не превращается в путь на диске", () => {
  assertEquals(safeFileName("../../etc/passwd", ".pdf"), "etc passwd.pdf");
  assertEquals(safeFileName("C:\\Windows\\System32", ".pdf"), "C Windows System32.pdf");
});

Deno.test("пустое название — запасное имя", () => {
  assertEquals(safeFileName(null, ".pdf"), "document.pdf");
  assertEquals(safeFileName("   ", ".pdf"), "document.pdf");
  assertEquals(safeFileName("///", ".pdf"), "document.pdf");
});

Deno.test("очень длинное название обрезается", () => {
  const name = safeFileName("а".repeat(300), ".pdf");
  assertEquals(name.length <= 84, true, `слишком длинно: ${name.length}`);
});

Deno.test("обычное название сохраняется как есть", () => {
  assertEquals(safeFileName("Выписка ПНД 2026", "_text.txt"), "Выписка ПНД 2026_text.txt");
});
