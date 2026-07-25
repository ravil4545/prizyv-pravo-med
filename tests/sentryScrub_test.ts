/// <reference lib="deno.ns" />
// Вычистка ПДн перед отправкой в Sentry. Запуск: deno test tests/
//
// Это тот случай, где тесты защищают не от бага, а от утечки медданных.
// Проверяется, что персональные данные НЕ проходят фильтр ни одним путём:
// ни в сообщении, ни в URL, ни в крошках, ни в контексте.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from "../src/lib/sentryScrub.ts";

const hasPii = (s: string) =>
  /[\w.+-]+@[\w-]+\.\w+|\+7\d|Петрович|123-456-789|4515/.test(s);

Deno.test("email вычищается", () => {
  const out = scrubText("Ошибка у пользователя ivan.petrov@mail.ru при загрузке");
  assertEquals(out.includes("ivan.petrov@mail.ru"), false);
  assertEquals(out.includes("[вырезано]:email"), true);
});

Deno.test("телефон вычищается в любом написании", () => {
  for (const p of ["+7 925 350 05 33", "+79253500533", "8 (925) 350-05-33", "8925-350-05-33"]) {
    const out = scrubText(`Звонок ${p} не прошёл`);
    assertEquals(hasPii(out), false, `не вычищен: ${p}`);
  }
});

Deno.test("СНИЛС, полис и паспорт вычищаются", () => {
  assertEquals(scrubText("СНИЛС 123-456-789 00").includes("123-456-789"), false);
  assertEquals(scrubText("полис 1234 5678 9012 3456").includes("9012"), false);
  assertEquals(scrubText("серия 4515 № 123456").includes("4515"), false);
});

Deno.test("ФИО с отчеством вычищается", () => {
  const out = scrubText("Заявитель Иванов Пётр Петрович не найден");
  assertEquals(out.includes("Петрович"), false);
  assertEquals(out.includes("[вырезано]:ФИО"), true);
});

Deno.test("текст без ПДн не портится", () => {
  const clean = "TypeError: Cannot read property 'id' of undefined";
  assertEquals(scrubText(clean), clean);
});

Deno.test("query-строка отрезается целиком — там бывает диагноз", () => {
  // /ai?q=<жалоба> — реальный маршрут этого сайта.
  const out = scrubUrl("https://nepriziv.ru/ai?q=астма%20с%20детства");
  assertEquals(out.includes("астма"), false);
  assertEquals(out.startsWith("https://nepriziv.ru/ai"), true);
  // Путь сохраняется — по нему и ищут ошибку.
  assertEquals(scrubUrl("https://nepriziv.ru/razbor"), "https://nepriziv.ru/razbor");
});

Deno.test("крошки с вводом в поля выбрасываются целиком", () => {
  assertEquals(scrubBreadcrumb({ category: "ui.input", message: "астма с 12 лет" }), null);
  assertEquals(scrubBreadcrumb({ category: "console", message: "dump: {...}" }), null);
});

Deno.test("в крошке остаётся только техническая часть", () => {
  const out = scrubBreadcrumb({
    category: "fetch",
    message: "POST https://x/ai?q=диагноз",
    data: { method: "POST", status_code: 500, url: "https://x/ai?q=диагноз", body: "секрет" },
  });
  assertEquals(out?.data?.method, "POST");
  assertEquals(out?.data?.status_code, 500);
  assertEquals("body" in (out?.data ?? {}), false, "тело запроса не должно попасть в Sentry");
  assertEquals(String(out?.data?.url).includes("диагноз"), false);
});

Deno.test("событие: extra выбрасывается целиком", () => {
  const out = scrubEvent({
    message: "Ошибка",
    extra: { diagnosis: "бронхиальная астма", user_phone: "+79253500533" },
  });
  assertEquals("extra" in (out ?? {}), false);
});

Deno.test("событие: от пользователя остаётся только id", () => {
  const out = scrubEvent({
    user: { id: "u-1", email: "ivan@mail.ru", username: "Иванов Пётр Петрович" },
  });
  assertEquals(out?.user, { id: "u-1" });
});

Deno.test("событие: из запроса выбрасываются тело, cookies и лишние заголовки", () => {
  const out = scrubEvent({
    request: {
      url: "https://nepriziv.ru/ai?q=астма",
      data: { complaint: "астма с детства" },
      cookies: "session=abc",
      headers: { "content-type": "application/json", authorization: "Bearer secret", cookie: "s=1" },
    },
  });
  assertEquals("data" in (out?.request ?? {}), false);
  assertEquals("cookies" in (out?.request ?? {}), false);
  assertEquals(out?.request?.headers?.authorization, undefined);
  assertEquals(out?.request?.headers?.["content-type"], "application/json");
  assertEquals(String(out?.request?.url).includes("астма"), false);
});

Deno.test("событие: текст исключения вычищается", () => {
  const out = scrubEvent({
    exception: { values: [{ type: "Error", value: "Не найден Иванов Пётр Петрович, тел. +79253500533" }] },
  });
  const v = out?.exception?.values?.[0]?.value ?? "";
  assertEquals(hasPii(v), false);
});

Deno.test("null не роняет фильтры", () => {
  assertEquals(scrubEvent(null), null);
  assertEquals(scrubBreadcrumb(null), null);
});

Deno.test("сквозная проверка: в готовом событии не остаётся ПДн", () => {
  const out = scrubEvent({
    message: "Сбой у ivan@mail.ru (+7 925 350 05 33)",
    request: { url: "https://nepriziv.ru/razbor?q=астма&email=ivan@mail.ru" },
    breadcrumbs: [
      { category: "ui.input", message: "бронхиальная астма с 12 лет" },
      { category: "navigation", message: "переход на /ai?q=астма" },
    ],
    extra: { passport: "серия 4515 № 123456" },
    user: { email: "ivan@mail.ru" },
  });
  const serialized = JSON.stringify(out);
  assertEquals(hasPii(serialized), false, `ПДн просочились: ${serialized}`);
  assertEquals(serialized.includes("астма"), false, "диагноз просочился");
});
