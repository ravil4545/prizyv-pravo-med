/// <reference lib="deno.ns" />
// Сторож единого источника конфигурации Supabase. Запуск: deno test tests/
//
// Адрес проекта и anon-ключ были захардкожены в 13 местах, из-за чего правка
// .env не переключала окружение: часть приложения продолжала ходить в облако.
// Заметить это можно было только по факту — половина страниц работает,
// половина нет.
//
// Особый случай — src/integrations/supabase/client.ts: его генерирует Lovable
// и при перегенерации он вернёт хардкод обратно. Этот тест и есть механизм,
// который поймает возврат, иначе следующий переезд снова упрётся в то же.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { fromFileUrl, join, relative } from "https://deno.land/std@0.208.0/path/mod.ts";

// fromFileUrl, а не .pathname: в пути к проекту есть пробелы, и .pathname
// отдал бы их как %20 — Deno такой каталог не найдёт.
const ROOT = fromFileUrl(new URL("../", import.meta.url));

/** Единственное место, где облачные значения разрешены как запасной вариант. */
const ALLOWED = ["src/lib/supabaseConfig.ts"];

/** Файлы вне сборки приложения: документация, исторические миграции, скрипты. */
const IGNORED_DIRS = ["supabase/migrations", "node_modules", "dist", ".git"];

const SUPABASE_HOST = /https:\/\/[a-z0-9]{20}\.supabase\.co/;
const ANON_KEY = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3M/;

async function collectOffenders(
  dir: string,
  pattern: RegExp,
  exts: string[],
): Promise<string[]> {
  const offenders: string[] = [];
  for await (
    const entry of walk(join(ROOT, dir), { includeDirs: false, exts, skip: [/node_modules/] })
  ) {
    const rel = relative(ROOT, entry.path).replaceAll("\\", "/");
    if (ALLOWED.includes(rel)) continue;
    if (IGNORED_DIRS.some((d) => rel.startsWith(d))) continue;
    const text = await Deno.readTextFile(entry.path);
    if (pattern.test(text)) offenders.push(rel);
  }
  return offenders.sort();
}

Deno.test("адрес Supabase не захардкожен в исходниках приложения", async () => {
  const offenders = await collectOffenders("src", SUPABASE_HOST, [".ts", ".tsx"]);
  assertEquals(
    offenders,
    [],
    "адрес проекта должен приходить из @/lib/supabaseConfig (functionUrl/SUPABASE_URL), " +
      "иначе смена .env не переключит окружение. Нарушители: " + offenders.join(", "),
  );
});

Deno.test("anon-ключ не захардкожен в исходниках приложения", async () => {
  const offenders = await collectOffenders("src", ANON_KEY, [".ts", ".tsx"]);
  assertEquals(offenders, [], "ключ должен приходить из @/lib/supabaseConfig. Нарушители: " + offenders.join(", "));
});

Deno.test("сгенерированный client.ts берёт настройки из общего модуля", async () => {
  const text = await Deno.readTextFile(join(ROOT, "src/integrations/supabase/client.ts"));
  // Если Lovable перегенерирует файл, эта проверка упадёт — и мы узнаем об
  // этом на CI, а не на переезде.
  assertEquals(
    /from ["']@\/lib\/supabaseConfig["']/.test(text),
    true,
    "client.ts снова содержит собственные константы — верните импорт из @/lib/supabaseConfig",
  );
});

Deno.test("плагин пре-рендера не содержит собственных ключей", async () => {
  const text = await Deno.readTextFile(join(ROOT, "vite-plugin-seo-prerender.ts"));
  assertEquals(SUPABASE_HOST.test(text), false, "адрес проекта вернулся в плагин пре-рендера");
  assertEquals(ANON_KEY.test(text), false, "ключ вернулся в плагин пре-рендера");
});
