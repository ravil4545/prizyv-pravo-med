/// <reference lib="deno.ns" />
// Тесты геометрии сборки PDF. Запуск: deno test tests/
//
// Проверяется то, из-за чего документ теряет юридическую силу: обрезанный
// край листа. У справки печать и подпись стоят по краю — если снимок
// вылезет за поля страницы, ВВК увидит документ без печати.
//
// Функции с canvas/FileReader здесь не проверяются: им нужен браузер.
// Тестируем чистую арифметику, ради которой она и была вынесена наружу.

import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  fitImageToPage,
  MAX_IMAGE_DIMENSION,
  pdfRenderScale,
  scaleToMaxWidth,
} from "../src/lib/imagePipeline.ts";

const A4 = { width: 800, height: 1100 };
const PADDING = 20;

function assertFits(box: { x: number; y: number; width: number; height: number }) {
  assertEquals(box.x >= 0, true, `левый край за страницей: x=${box.x}`);
  assertEquals(box.y >= 0, true, `верхний край за страницей: y=${box.y}`);
  assertEquals(
    box.x + box.width <= A4.width + 1e-9,
    true,
    `правый край за страницей: ${box.x + box.width} > ${A4.width}`,
  );
  assertEquals(
    box.y + box.height <= A4.height + 1e-9,
    true,
    `нижний край за страницей: ${box.y + box.height} > ${A4.height}`,
  );
}

Deno.test("любое соотношение сторон помещается на страницу целиком", () => {
  const shapes = [
    { width: 100, height: 100 }, // квадрат
    { width: 4000, height: 100 }, // панорама
    { width: 100, height: 4000 }, // узкая колонка
    { width: 2480, height: 3508 }, // скан A4 300 dpi
    { width: 3508, height: 2480 }, // тот же лист боком
    { width: 1, height: 1 },
  ];
  for (const shape of shapes) {
    assertFits(fitImageToPage(shape, A4, PADDING));
  }
});

Deno.test("пропорции не искажаются — текст не растягивается", () => {
  for (const shape of [{ width: 2480, height: 3508 }, { width: 3508, height: 2480 }]) {
    const box = fitImageToPage(shape, A4, PADDING);
    assertAlmostEquals(box.width / box.height, shape.width / shape.height, 1e-9);
  }
});

Deno.test("изображение по центру страницы", () => {
  const box = fitImageToPage({ width: 1000, height: 1000 }, A4, PADDING);
  assertAlmostEquals(box.x, (A4.width - box.width) / 2, 1e-9);
  assertAlmostEquals(box.y, (A4.height - box.height) / 2, 1e-9);
});

Deno.test("вертикальный лист упирается в высоту, горизонтальный — в ширину", () => {
  const tall = fitImageToPage({ width: 2480, height: 3508 }, A4, PADDING);
  assertAlmostEquals(tall.height, A4.height - PADDING, 1e-9);

  const wide = fitImageToPage({ width: 3508, height: 2480 }, A4, PADDING);
  assertAlmostEquals(wide.width, A4.width - PADDING, 1e-9);
});

Deno.test("маленький снимок увеличивается до полей, а не тонет в углу", () => {
  const box = fitImageToPage({ width: 50, height: 70 }, A4, PADDING);
  assertEquals(box.height > 100, true, "снимок остался крошечным");
  assertFits(box);
});

Deno.test("вырожденная страница не роняет расчёт", () => {
  const box = fitImageToPage({ width: 100, height: 100 }, { width: 10, height: 10 }, PADDING);
  assertEquals(Number.isFinite(box.width), true);
  assertEquals(Number.isFinite(box.height), true);
  assertEquals(box.width > 0, true);
});

// ── Масштабирование ──────────────────────────────────────────────────────

Deno.test("узкое изображение не растягивается вверх", () => {
  assertEquals(scaleToMaxWidth(800, 1200, 2000), { width: 800, height: 1200 });
});

Deno.test("широкое — режется до предела с сохранением пропорций", () => {
  const out = scaleToMaxWidth(4000, 3000, 2000);
  assertEquals(out.width, 2000);
  assertAlmostEquals(out.height, 1500, 1e-9);
});

Deno.test("масштаб рендера PDF: мелкая страница крупнее, большая — до предела", () => {
  // Мелкая страница отрисовывается с увеличением, иначе OCR не разберёт текст.
  assertEquals(pdfRenderScale(595, 842), 1.5);

  // Крупная ужимается ровно до предела — ни пикселем больше.
  const scale = pdfRenderScale(5000, 3000);
  assertAlmostEquals(5000 * scale, MAX_IMAGE_DIMENSION, 1e-9);
  assertEquals(scale < 1, true);
});
