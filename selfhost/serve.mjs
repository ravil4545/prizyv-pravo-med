#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  Раздача собранного фронтенда со своей машины. Замена хостингу Lovable.
//
//  Запуск:
//    node selfhost/serve.mjs                 — порт 8080, папка dist
//    node selfhost/serve.mjs --port 8080 --dir dist --host 127.0.0.1
//
//  Почему на Node, а не Caddy или nginx: Node на машине уже стоит, а ставить
//  ещё одну программу ради раздачи статики незачем. Здесь нет TLS и нет
//  доступа наружу — сертификат и внешний вход даёт Cloudflare Tunnel,
//  который приходит на этот порт по localhost.
//
//  ГЛАВНОЕ, ЧЕГО ЛЕГКО НЕ ЗАМЕТИТЬ: пре-рендер. Плагин
//  vite-plugin-seo-prerender кладёт готовый <head> для каждой публичной
//  страницы в dist/<маршрут>/index.html — 110 страниц. Наивная раздача
//  «нет файла → отдать корневой index.html» вернёт краулеру пустую
//  оболочку, и вся SEO-работа пропадёт молча: люди-то увидят нормальную
//  страницу, её дорисует JavaScript. Поэтому порядок поиска такой:
//    точный файл → <маршрут>/index.html → корневой index.html
// ════════════════════════════════════════════════════════════════════════

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(arg("port", 8080));
const HOST = arg("host", "127.0.0.1");
const ROOT = resolve(arg("dir", "dist"));

if (!existsSync(join(ROOT, "index.html"))) {
  console.error(`В ${ROOT} нет index.html. Сначала соберите: npm run build`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json",
};

/**
 * Заголовок кэша считается по ОТДАВАЕМОМУ ФАЙЛУ, а не по адресу.
 *
 * Сначала было по адресу — и корень «/» не попадал под правило «.html»,
 * получая кэш на час. Любая выкладка после этого оставляла людей с
 * закэшированной оболочкой, которая ссылается на уже удалённые файлы с
 * хешами в именах: белый экран до принудительного обновления.
 */
const cacheFor = (file) => {
  const rel = file.slice(ROOT.length).replaceAll(sep, "/");
  // Файлы в /assets/ имеют хеш в имени: меняется содержимое — меняется имя,
  // поэтому их можно кэшировать навсегда.
  if (rel.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (rel.endsWith(".html") || rel.endsWith("sw.js")) return "no-cache";
  return "public, max-age=3600";
};

/** Защита от выхода за пределы папки: /../../secret */
function safeJoin(root, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = join(root, clean);
  return full.startsWith(root + sep) || full === root ? full : null;
}

const server = createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0].split("#")[0];
  const started = Date.now();

  const send = (file, status = 200, note = "") => {
    const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(status, {
      "Content-Type": type,
      "Cache-Control": cacheFor(file),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
    });
    createReadStream(file).pipe(res);
    if (process.env.QUIET !== "1") {
      console.log(`${status} ${urlPath}${note ? "  " + note : ""}  ${Date.now() - started}ms`);
    }
  };

  const target = safeJoin(ROOT, urlPath);
  if (!target) {
    res.writeHead(400).end("Bad path");
    return;
  }

  // 1. Точный файл
  if (existsSync(target) && statSync(target).isFile()) return send(target);

  // 2. Пре-рендеренная страница маршрута — ради неё всё и затевалось
  const pre = join(target, "index.html");
  if (existsSync(pre)) return send(pre, 200, "(пре-рендер)");

  // 3. Оболочка SPA. Без этого прямой заход на /diagnoses/68 или возврат из
  //    письма на /dashboard давал бы 404 — маршрут разбирает React Router
  //    уже в браузере.
  return send(join(ROOT, "index.html"), 200, "(оболочка SPA)");
});

server.listen(PORT, HOST, () => {
  console.log(`Раздаю ${ROOT}`);
  console.log(`http://${HOST}:${PORT}/`);
  console.log("Остановить — Ctrl+C");
});
