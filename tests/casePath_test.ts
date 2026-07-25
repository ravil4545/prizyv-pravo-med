/// <reference lib="deno.ns" />
// ════════════════════════════════════════════════════════════════════════
//  Тесты карты пути дела (src/lib/casePath.ts).
//
//  Запуск:  deno test tests/
//
//  Почему Deno, а не Jest/Vitest: в проекте нет JS-тест-раннера вообще, но
//  Deno уже стоит и используется для edge-функций (см. supabase/functions/
//  _shared/*_test.ts). Ставить второй раннер ради одного модуля — лишнее.
//
//  Почему папка tests/, а не рядом с модулем: файл внутри src/ попал бы в
//  tsconfig.app.json и в сборку Vite, где нет ни глобала Deno, ни импортов по
//  URL, — это ломает и `tsc --noEmit`, и `npm run build`.
//
//  casePath.ts намеренно написан без импортов React/Supabase — именно чтобы
//  его логику можно было проверить, а не только посмотреть глазами.
// ════════════════════════════════════════════════════════════════════════

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCasePath,
  computeReadiness,
  daysUntil,
  type CasePathInput,
} from "../src/lib/casePath.ts";

const TODAY = new Date("2026-07-25T12:00:00Z");

const base: CasePathInput = {
  articles: [],
  documentsTotal: 0,
  requirementsMet: 0,
  requirementsTotal: 0,
  events: [],
  conscriptionDate: null,
  today: TODAY,
};

Deno.test("пустое дело: текущая станция — диагноз, готовность 0", () => {
  const path = buildCasePath(base);
  assertEquals(path.currentIndex, 0);
  assertEquals(path.stations[0].status, "current");
  assertEquals(path.stations[0].detail, "не начато");
  assertEquals(path.readiness, 0);
  // Подсказка есть только у текущей станции — иначе экран превращается в шум.
  assertEquals(typeof path.stations[0].hint, "string");
  assertEquals(path.stations[1].hint, undefined);
});

Deno.test("документы есть, но статья не определена — честно говорим об этом", () => {
  const path = buildCasePath({ ...base, documentsTotal: 2 });
  assertEquals(path.stations[0].status, "current");
  assertEquals(path.stations[0].detail, "статья не определена");
  // 1 балл за наличие документов + 2 за их количество; диагноз не засчитан
  assertEquals(path.readiness, 3);
});

Deno.test("статья определена — станция пройдена, показываем номера", () => {
  const path = buildCasePath({ ...base, articles: ["52", "68"], documentsTotal: 3 });
  assertEquals(path.stations[0].status, "done");
  assertEquals(path.stations[0].detail, "ст. 52, ст. 68");
  assertEquals(path.currentIndex, 1);
});

Deno.test("покрытие требований отражается в подписи и в готовности", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 3,
    requirementsMet: 3,
    requirementsTotal: 7,
  });
  assertEquals(path.stations[1].detail, "3 из 7");
  assertEquals(path.stations[1].status, "current");
  // 3 (диагноз) + round(3/7*5) = 3 + 2 = 5
  assertEquals(path.readiness, 5);
  assertEquals(path.stations[1].hint?.includes("Не хватает 4"), true);
});

Deno.test("полное покрытие закрывает станцию документов", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 5,
    requirementsMet: 7,
    requirementsTotal: 7,
  });
  assertEquals(path.stations[1].status, "done");
  assertEquals(path.currentIndex, 2);
  assertEquals(path.readiness, 8); // 3 + 5; подача ещё не отмечена
});

Deno.test("подача документов даёт +2 и двигает путь", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 5,
    requirementsMet: 7,
    requirementsTotal: 7,
    events: [{ event_type: "document", event_date: "2026-07-01" }],
  });
  assertEquals(path.stations[2].status, "done");
  assertEquals(path.stations[2].detail, "01.07.2026");
  assertEquals(path.readiness, 10);
});

Deno.test("положительное решение открывает военный билет", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 5,
    requirementsMet: 7,
    requirementsTotal: 7,
    events: [
      { event_type: "document", event_date: "2026-07-01" },
      { event_type: "medical", event_date: "2026-07-10" },
      { event_type: "commission", event_date: "2026-07-20", outcome: "positive" },
    ],
  });
  assertEquals(path.stations[4].detail, "положительное");
  assertEquals(path.stations[5].status, "done");
  assertEquals(path.currentIndex, -1); // путь пройден целиком
});

Deno.test("отрицательное решение НЕ закрывает военный билет и подсказывает срок", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 5,
    requirementsMet: 7,
    requirementsTotal: 7,
    events: [
      { event_type: "document", event_date: "2026-07-01" },
      { event_type: "medical", event_date: "2026-07-10" },
      { event_type: "commission", event_date: "2026-07-20", outcome: "negative" },
    ],
  });
  assertEquals(path.stations[4].detail, "отрицательное");
  assertEquals(path.stations[5].status, "current");
  assertEquals(path.stations[5].hint?.includes("обжалование"), true);
});

Deno.test("до медкомиссии показываем обратный отсчёт", () => {
  const path = buildCasePath({
    ...base,
    articles: ["52"],
    documentsTotal: 2,
    conscriptionDate: "2026-08-05",
  });
  assertEquals(path.daysLeft, 11);
  assertEquals(path.stations[3].detail, "через 11 дн.");
});

Deno.test("прошедшая дата даёт отрицательный отсчёт, а не ноль", () => {
  assertEquals(daysUntil("2026-07-20", TODAY), -5);
  assertEquals(daysUntil(null, TODAY), null);
  assertEquals(daysUntil("не дата", TODAY), null);
});

Deno.test("готовность никогда не выходит за 0..10", () => {
  const over = computeReadiness({
    ...base,
    articles: ["52"],
    documentsTotal: 99,
    requirementsMet: 99,
    requirementsTotal: 7,
    events: [{ event_type: "document", event_date: "2026-07-01" }],
  });
  assertEquals(over, 10);
});
