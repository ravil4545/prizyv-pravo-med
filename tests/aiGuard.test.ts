// Тесты суточного лимита дорогих ИИ-вызовов (_shared/aiGuard.ts).
//
// Проверяем ровно то, что в проде дорого проверять руками: что ключ лимита
// разный у разных пользователей, что незалогиненные считаются по хешу IP
// (а не по сырому адресу), и что при сбое БД функция ПРОПУСКАЕТ запрос —
// иначе падение таблицы лимитов кладёт разбор документов всему сайту.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceDailyLimit } from "../supabase/functions/_shared/aiGuard.ts";

const HEADERS = { "Access-Control-Allow-Origin": "https://nepriziv.ru" };

/** Поддельный admin-клиент: запоминает аргументы rpc и отдаёт заданный ответ. */
function fakeAdmin(result: { data?: unknown; error?: unknown } | (() => never)) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    // deno-lint-ignore no-explicit-any
    rpc(_name: string, args: Record<string, unknown>): any {
      calls.push(args);
      if (typeof result === "function") result();
      return Promise.resolve(result);
    },
  };
}

function req(ip = "203.0.113.7"): Request {
  return new Request("https://example.test/", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

Deno.test("в пределах лимита — пропускает (null)", async () => {
  const admin = fakeAdmin({ data: true });
  const res = await enforceDailyLimit({
    req: req(),
    admin,
    functionName: "analyze-medical-document",
    userId: "u-1",
    fallbackMax: 40,
    headers: HEADERS,
  });
  assertEquals(res, null);
});

Deno.test("лимит исчерпан — 429 с человеческим текстом и CORS", async () => {
  const admin = fakeAdmin({ data: false });
  const res = await enforceDailyLimit({
    req: req(),
    admin,
    functionName: "analyze-medical-document",
    userId: "u-1",
    fallbackMax: 40,
    headers: HEADERS,
    message: "Сегодня доступно 40 разборов документов.",
  });
  if (!res) throw new Error("ожидался ответ 429");
  assertEquals(res.status, 429);
  // CORS обязан пережить отказ: иначе браузер покажет ошибку сети вместо текста.
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://nepriziv.ru");
  const body = await res.json();
  assertEquals(body.rateLimited, true);
  assertStringIncludes(body.error, "40 разборов");
});

Deno.test("без message — понятный текст по умолчанию с числом лимита", async () => {
  const admin = fakeAdmin({ data: false });
  const res = await enforceDailyLimit({
    req: req(),
    admin,
    functionName: "f",
    userId: "u-1",
    fallbackMax: 15,
    headers: HEADERS,
  });
  const body = await res!.json();
  assertStringIncludes(body.error, "15");
});

Deno.test("авторизован — ключ по пользователю, не по IP", async () => {
  const admin = fakeAdmin({ data: true });
  await enforceDailyLimit({
    req: req(),
    admin,
    functionName: "parse-summons",
    userId: "aaaa-bbbb",
    fallbackMax: 20,
    headers: HEADERS,
  });
  assertEquals(admin.calls[0].p_key, "parse-summons:user:aaaa-bbbb");
});

Deno.test("аноним — ключ по ХЕШУ ip, сырой адрес в ключ не попадает", async () => {
  const admin = fakeAdmin({ data: true });
  await enforceDailyLimit({
    req: req("203.0.113.7"),
    admin,
    functionName: "enhance-document",
    fallbackMax: 30,
    headers: HEADERS,
  });
  const key = String(admin.calls[0].p_key);
  assertStringIncludes(key, "enhance-document:ip:");
  // 152-ФЗ: адрес не хранится ни в каком виде, кроме необратимого хеша.
  assertEquals(key.includes("203.0.113.7"), false);
});

Deno.test("разные IP — разные ключи, одинаковые IP — один ключ", async () => {
  const a = fakeAdmin({ data: true });
  const b = fakeAdmin({ data: true });
  const c = fakeAdmin({ data: true });
  const opts = { functionName: "enhance-document", fallbackMax: 30, headers: HEADERS };
  await enforceDailyLimit({ ...opts, req: req("198.51.100.1"), admin: a });
  await enforceDailyLimit({ ...opts, req: req("198.51.100.2"), admin: b });
  await enforceDailyLimit({ ...opts, req: req("198.51.100.1"), admin: c });
  assertEquals(a.calls[0].p_key === b.calls[0].p_key, false);
  assertEquals(a.calls[0].p_key, c.calls[0].p_key);
});

Deno.test("сбой БД — fail-open: пропускаем, а не отказываем человеку", async () => {
  const withError = fakeAdmin({ error: { message: "connection refused" } });
  assertEquals(
    await enforceDailyLimit({
      req: req(),
      admin: withError,
      functionName: "f",
      userId: "u",
      fallbackMax: 10,
      headers: HEADERS,
    }),
    null,
  );

  const throwing = fakeAdmin(() => {
    throw new Error("boom");
  });
  assertEquals(
    await enforceDailyLimit({
      req: req(),
      admin: throwing,
      functionName: "f",
      userId: "u",
      fallbackMax: 10,
      headers: HEADERS,
    }),
    null,
  );
});

Deno.test("env-переменная перекрывает fallback", async () => {
  Deno.env.set("TEST_GUARD_MAX", "3");
  try {
    const admin = fakeAdmin({ data: false });
    const res = await enforceDailyLimit({
      req: req(),
      admin,
      functionName: "f",
      userId: "u",
      envKey: "TEST_GUARD_MAX",
      fallbackMax: 40,
      headers: HEADERS,
    });
    assertEquals(admin.calls[0].p_max_requests, 3);
    assertStringIncludes((await res!.json()).error, "3 запрос");
  } finally {
    Deno.env.delete("TEST_GUARD_MAX");
  }
});

Deno.test("лимит 0 или мусор в env — предохранитель выключен, БД не трогаем", async () => {
  for (const value of ["0", "-5", "нет"]) {
    Deno.env.set("TEST_GUARD_MAX", value);
    const admin = fakeAdmin({ data: false });
    const res = await enforceDailyLimit({
      req: req(),
      admin,
      functionName: "f",
      userId: "u",
      envKey: "TEST_GUARD_MAX",
      fallbackMax: 40,
      headers: HEADERS,
    });
    assertEquals(res, null, `значение ${value} должно отключать лимит`);
    assertEquals(admin.calls.length, 0, "лишний запрос к БД при выключенном лимите");
  }
  Deno.env.delete("TEST_GUARD_MAX");
});

Deno.test("окно лимита — начало текущих суток UTC", async () => {
  const admin = fakeAdmin({ data: true });
  await enforceDailyLimit({
    req: req(),
    admin,
    functionName: "f",
    userId: "u",
    fallbackMax: 10,
    headers: HEADERS,
  });
  const start = new Date(String(admin.calls[0].p_window_start));
  assertEquals(start.getUTCHours(), 0);
  assertEquals(start.getUTCMinutes(), 0);
  assertEquals(start.getUTCSeconds(), 0);
  assertEquals(start.getUTCMilliseconds(), 0);
});
