/// <reference lib="deno.ns" />
// Тесты списка медицинских документов. Запуск: deno test tests/
//
// Сортировка и фильтр — это то, через что человек ищет свою справку среди
// двух десятков загруженных. Ошибка здесь не падает с исключением: документ
// просто не виден, и человек считает, что потерял его.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDocumentsOverview,
  categoryBadgeVariant,
  filterAndSortDocuments,
  nextSortState,
} from "../src/lib/documentSort.ts";
import type { MedicalDocument } from "../src/lib/medicalDocumentTypes.ts";

function doc(over: Partial<MedicalDocument> & { id: string }): MedicalDocument {
  return {
    title: null,
    file_url: "u",
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

const ALL = { filterType: "all", searchQuery: "" };
const ids = (list: MedicalDocument[]) => list.map((d) => d.id);

// ── Фильтр ────────────────────────────────────────────────────────────────

Deno.test("фильтр по типу документа", () => {
  const list = [
    doc({ id: "a", document_type_id: "t1" }),
    doc({ id: "b", document_type_id: "t2" }),
  ];
  assertEquals(
    ids(filterAndSortDocuments(list, { filterType: "t1", searchQuery: "" }, {
      sortField: "uploaded_at",
      sortDirection: "desc",
    })),
    ["a"],
  );
});

Deno.test("поиск не зависит от регистра и лишних пробелов", () => {
  const list = [doc({ id: "a", title: "Выписка ПНД" }), doc({ id: "b", title: "МРТ" })];
  const sort = { sortField: "uploaded_at" as const, sortDirection: "desc" as const };
  assertEquals(ids(filterAndSortDocuments(list, { filterType: "all", searchQuery: "  пнд " }, sort)), ["a"]);
});

Deno.test("документ без названия при поиске скрывается, без поиска — виден", () => {
  const list = [doc({ id: "a", title: null }), doc({ id: "b", title: "МРТ" })];
  const sort = { sortField: "uploaded_at" as const, sortDirection: "desc" as const };
  assertEquals(ids(filterAndSortDocuments(list, { filterType: "all", searchQuery: "мрт" }, sort)), ["b"]);
  assertEquals(filterAndSortDocuments(list, ALL, sort).length, 2);
});

// ── Сортировка ────────────────────────────────────────────────────────────

Deno.test("сортировка по дате: desc — сначала новые, asc — сначала старые", () => {
  const list = [
    doc({ id: "старый", uploaded_at: "2026-01-01T10:00:00Z" }),
    doc({ id: "новый", uploaded_at: "2026-07-01T10:00:00Z" }),
  ];
  assertEquals(
    ids(filterAndSortDocuments(list, ALL, { sortField: "uploaded_at", sortDirection: "desc" })),
    ["новый", "старый"],
  );
  assertEquals(
    ids(filterAndSortDocuments(list, ALL, { sortField: "uploaded_at", sortDirection: "asc" })),
    ["старый", "новый"],
  );
});

Deno.test("документы без даты всегда внизу — в обоих направлениях", () => {
  const list = [
    doc({ id: "без-даты", document_date: null }),
    doc({ id: "май", document_date: "2026-05-01" }),
    doc({ id: "январь", document_date: "2026-01-01" }),
  ];
  for (const dir of ["asc", "desc"] as const) {
    const out = ids(filterAndSortDocuments(list, ALL, { sortField: "document_date", sortDirection: dir }));
    assertEquals(out[out.length - 1], "без-даты", `направление ${dir}`);
  }
});

Deno.test("опросник закреплён сверху, что бы ни выбрали в сортировке", () => {
  const list = [
    doc({ id: "свежая-справка", uploaded_at: "2026-07-20T00:00:00Z" }),
    doc({ id: "опросник", uploaded_at: "2026-01-01T00:00:00Z", meta: { is_questionnaire: true } }),
  ];
  for (const dir of ["asc", "desc"] as const) {
    assertEquals(
      ids(filterAndSortDocuments(list, ALL, { sortField: "uploaded_at", sortDirection: dir }))[0],
      "опросник",
      `направление ${dir}`,
    );
  }
});

Deno.test("сортировка по названию — по русским правилам, а не по кодам символов", () => {
  // Ё имеет код U+0401 — ДО «А» (U+0410). Простое сравнение строк выбросило бы
  // «Ёлкину» в самое начало списка. В русской сортировке Ё — вариант Е, поэтому
  // правильный порядок: Аникин, Ёлкина, Епифанов, Жалоба.
  const list = [
    doc({ id: "ж", title: "Жалоба" }),
    doc({ id: "ё", title: "Ёлкина" }),
    doc({ id: "е", title: "Епифанов" }),
    doc({ id: "а", title: "Аникин" }),
  ];
  assertEquals(
    ids(filterAndSortDocuments(list, ALL, { sortField: "title", sortDirection: "asc" })),
    ["а", "ё", "е", "ж"],
  );
});

Deno.test("исходный массив не мутируется", () => {
  const list = [
    doc({ id: "a", uploaded_at: "2026-01-01T00:00:00Z" }),
    doc({ id: "b", uploaded_at: "2026-07-01T00:00:00Z" }),
  ];
  filterAndSortDocuments(list, ALL, { sortField: "uploaded_at", sortDirection: "desc" });
  assertEquals(ids(list), ["a", "b"]);
});

Deno.test("клик по колонке: та же — переворот, другая — сначала новые", () => {
  assertEquals(nextSortState({ sortField: "title", sortDirection: "asc" }, "title"), {
    sortField: "title",
    sortDirection: "desc",
  });
  assertEquals(nextSortState({ sortField: "title", sortDirection: "desc" }, "title"), {
    sortField: "title",
    sortDirection: "asc",
  });
  assertEquals(nextSortState({ sortField: "title", sortDirection: "asc" }, "document_date"), {
    sortField: "document_date",
    sortDirection: "desc",
  });
});

// ── Цвет категории ────────────────────────────────────────────────────────

Deno.test("В и Д не красные: для призывника это желаемый исход, а не беда", () => {
  assertEquals(categoryBadgeVariant("В"), "default");
  assertEquals(categoryBadgeVariant("Д"), "default");
  assertEquals(categoryBadgeVariant("Г"), "outline");
  assertEquals(categoryBadgeVariant("А"), "secondary");
  assertEquals(categoryBadgeVariant("Б"), "secondary");
});

Deno.test("категория из ИИ приходит грязной — регистр и пробелы не ломают цвет", () => {
  assertEquals(categoryBadgeVariant(" в "), "default");
  assertEquals(categoryBadgeVariant(null), "secondary");
  assertEquals(categoryBadgeVariant("непонятно"), "secondary");
});

// ── Сводка и «что дальше» ────────────────────────────────────────────────

Deno.test("пустой кабинет — первый шаг «загрузите документ»", () => {
  const o = buildDocumentsOverview([]);
  assertEquals(o.bestDocument, undefined);
  assertEquals(o.nextActions[0], "Загрузите хотя бы одну свежую выписку, заключение или снимок.");
});

Deno.test("лучший документ — с наибольшей силой подтверждения", () => {
  const o = buildDocumentsOverview([
    doc({ id: "слабый", ai_category_chance: 30 }),
    doc({ id: "сильный", ai_category_chance: 80 }),
    doc({ id: "без-оценки", ai_explanation: "текст" }),
  ]);
  assertEquals(o.bestDocument?.id, "сильный");
  assertEquals(o.analyzedDocuments.length, 3);
});

Deno.test("оценка 0 — это оценка, а не «нет данных»", () => {
  const o = buildDocumentsOverview([doc({ id: "ноль", ai_category_chance: 0 })]);
  assertEquals(o.bestDocument?.id, "ноль");
  // Слабое подтверждение — подсказываем донести документы.
  assertEquals(
    o.nextActions.includes(
      "Добавьте более свежие обследования или документы с функциональными нарушениями.",
    ),
    true,
  );
});

Deno.test("сильный документ — совета «донесите обследования» нет", () => {
  const o = buildDocumentsOverview([
    doc({ id: "сильный", ai_category_chance: 85, ai_recommendations: ["Сделать МРТ"] }),
    doc({ id: "опросник", meta: { is_questionnaire: true } }),
  ]);
  assertEquals(
    o.nextActions.some((a) => a.startsWith("Добавьте более свежие")),
    false,
  );
  assertEquals(o.hasQuestionnaire, true);
});

Deno.test("рекомендации дедуплицируются и режутся по лимиту", () => {
  const o = buildDocumentsOverview(
    [
      doc({ id: "a", ai_recommendations: ["Сделать МРТ", " Сделать МРТ ", "  ", "ЭЭГ"] }),
      doc({ id: "b", ai_recommendations: ["ЭЭГ", "Выписка ПНД", "Рентген"] }),
    ],
    2,
  );
  assertEquals(o.uniqueRecommendations, ["Сделать МРТ", "ЭЭГ"]);
});
