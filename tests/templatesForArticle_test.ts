/// <reference lib="deno.ns" />
// Связка «статья РБ -> нужные документы». Запуск: deno test tests/
//
// Главное, что проверяется: подборка не может сослаться на несуществующий
// шаблон — иначе пользователь со страницы диагноза уйдёт в никуда.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DOC_TEMPLATES } from "../src/lib/docTemplates.ts";
import {
  medicalSourceLabel,
  QUALITY_ESCALATION,
  templatesForArticle,
} from "../src/lib/templatesForArticle.ts";

const VALID_KEYS = new Set(DOC_TEMPLATES.map((t) => t.key));

// Все 16 профилей из disease_articles_565 (сверено запросом к базе 25.07.2026).
const ALL_CATEGORIES = [
  "infections", "tumors", "blood", "endocrine", "mental", "nervous_system",
  "eyes", "ears", "cardiology", "respiratory", "digestive", "skin",
  "musculoskeletal", "urogenital", "pregnancy", "trauma",
];

Deno.test("для каждого профиля подборка ссылается только на существующие шаблоны", () => {
  for (const cat of ALL_CATEGORIES) {
    for (const item of templatesForArticle(cat)) {
      assertEquals(VALID_KEYS.has(item.key), true, `${cat}: неизвестный шаблон «${item.key}»`);
      assertEquals(item.reason.length > 20, true, `${cat}/${item.key}: основание слишком короткое`);
    }
  }
});

Deno.test("эскалация по качеству диагноза тоже ведёт на реальные шаблоны", () => {
  for (const item of QUALITY_ESCALATION) {
    assertEquals(VALID_KEYS.has(item.key), true, `неизвестный шаблон «${item.key}»`);
  }
});

Deno.test("психиатрия ведёт в ПНД, а не в поликлинику", () => {
  const keys = templatesForArticle("mental").map((t) => t.key);
  assertEquals(keys.includes("pnd_extract"), true);
  assertEquals(keys.includes("form027_polyclinic"), false);
  assertEquals(medicalSourceLabel("mental").includes("ПНД"), true);
});

Deno.test("кожные ведут в КВД", () => {
  const keys = templatesForArticle("skin").map((t) => t.key);
  assertEquals(keys.includes("kvd_extract"), true);
  assertEquals(keys.includes("form027_polyclinic"), false);
  assertEquals(medicalSourceLabel("skin").includes("КВД"), true);
});

Deno.test("остальные профили — поликлиника", () => {
  for (const cat of ["respiratory", "cardiology", "musculoskeletal", "trauma"]) {
    const keys = templatesForArticle(cat).map((t) => t.key);
    assertEquals(keys.includes("form027_polyclinic"), true, cat);
  }
  assertEquals(medicalSourceLabel("respiratory").includes("оликлиник"), true);
});

Deno.test("неизвестный или пустой профиль не ломает подборку", () => {
  // Самый частый случай — поликлиника; молчаливо пустой список был бы хуже.
  for (const bad of [null, undefined, "", "невесть_что"]) {
    const items = templatesForArticle(bad);
    assertEquals(items.length > 0, true);
    assertEquals(items.every((i) => VALID_KEYS.has(i.key)), true);
  }
});

Deno.test("универсальные документы есть в любой подборке", () => {
  for (const cat of ALL_CATEGORIES) {
    const keys = templatesForArticle(cat).map((t) => t.key);
    // Приобщение — то, без чего документы юридически не существуют.
    assertEquals(keys.includes("attach_docs"), true, cat);
    assertEquals(keys.includes("additional_exam"), true, cat);
  }
});

Deno.test("в подборке нет повторов", () => {
  for (const cat of ALL_CATEGORIES) {
    const keys = templatesForArticle(cat).map((t) => t.key);
    assertEquals(new Set(keys).size, keys.length, `дубликаты в профиле ${cat}`);
  }
});
