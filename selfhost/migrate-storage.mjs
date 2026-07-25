#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  Перенос файлов Storage из облачного Supabase в локальный.
//
//  Запуск:
//    node selfhost/migrate-storage.mjs            — перенести
//    node selfhost/migrate-storage.mjs --dry-run  — только показать план
//    node selfhost/migrate-storage.mjs --verify   — сверить, что всё доехало
//
//  Ключи берутся из окружения или из selfhost/migrate.secrets.env
//  (файл в .gitignore, шаблон — migrate.secrets.example.env):
//    CLOUD_URL, CLOUD_SERVICE_KEY, LOCAL_URL, LOCAL_SERVICE_KEY
//
//  ВАЖНО ПРО КЛЮЧИ. Нужны именно service_role: приватные бакеты
//  (medical-documents, test-results, chat-attachments) закрыты RLS, и
//  анонимным ключом их не прочитать. service_role обходит RLS —
//  не коммитить, не вставлять в браузерный код.
//
//  Скрипт ИДЕМПОТЕНТЕН: повторный запуск дозаливает недостающее, а не
//  дублирует. Прерванный перенос можно просто запустить снова.
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Настройки бакетов ───────────────────────────────────────────────────
// public повторяет прод: перепутать здесь флаг — значит либо выставить
// медданные наружу, либо сломать показ картинок блога.
const BUCKETS = [
  { name: "blog-images", public: true },
  { name: "lawyer-brand-assets", public: true },
  { name: "chat-attachments", public: false },
  { name: "medical-documents", public: false },
  { name: "test-results", public: false },
];

const MEDICAL_LIMITS = {
  fileSizeLimit: 20 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
};

// ── Секреты ─────────────────────────────────────────────────────────────
function loadSecrets() {
  const file = join(HERE, "migrate.secrets.env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadSecrets();

const CLOUD_URL = process.env.CLOUD_URL;
const CLOUD_KEY = process.env.CLOUD_SERVICE_KEY;
const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:8000";
const LOCAL_KEY = process.env.LOCAL_SERVICE_KEY;

const DRY = process.argv.includes("--dry-run");
const VERIFY = process.argv.includes("--verify");

if (!CLOUD_URL || !CLOUD_KEY || (!DRY && !LOCAL_KEY)) {
  console.error(
    "Не заданы ключи. Скопируйте selfhost/migrate.secrets.example.env в\n" +
      "selfhost/migrate.secrets.env и заполните CLOUD_URL, CLOUD_SERVICE_KEY,\n" +
      "LOCAL_URL, LOCAL_SERVICE_KEY.",
  );
  process.exit(1);
}

const src = createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: false } });
const dst = LOCAL_KEY
  ? createClient(LOCAL_URL, LOCAL_KEY, { auth: { persistSession: false } })
  : null;

// ── Обход бакета ────────────────────────────────────────────────────────
/**
 * Рекурсивный обход: storage.list отдаёт только один уровень, а файлы лежат
 * в папках вида {user_id}/{файл} и chat/{lawyer_client_id}/{файл}. Плоский
 * список перенёс бы ноль файлов и выглядел бы при этом успешным.
 */
async function listAll(client, bucket, prefix = "") {
  const out = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // У папки нет id и metadata — по этому её и отличаем.
      if (item.id === null) out.push(...(await listAll(client, bucket, path)));
      else out.push({ path, size: Number(item.metadata?.size ?? 0), mime: item.metadata?.mimetype });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

async function ensureBucket(cfg) {
  const { data: existing } = await dst.storage.getBucket(cfg.name);
  const options = {
    public: cfg.public,
    ...(cfg.name === "medical-documents" || cfg.name === "chat-attachments" ? MEDICAL_LIMITS : {}),
  };
  if (existing) {
    await dst.storage.updateBucket(cfg.name, options);
    return "обновлён";
  }
  const { error } = await dst.storage.createBucket(cfg.name, options);
  if (error) throw new Error(`createBucket ${cfg.name}: ${error.message}`);
  return "создан";
}

const human = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;

// ── Основной проход ─────────────────────────────────────────────────────
let totalFiles = 0;
let totalBytes = 0;
let copied = 0;
let skipped = 0;
const failures = [];

for (const cfg of BUCKETS) {
  let files;
  try {
    files = await listAll(src, cfg.name);
  } catch (e) {
    console.error(`!! ${cfg.name}: ${e.message}`);
    failures.push({ bucket: cfg.name, path: "(список)", error: e.message });
    continue;
  }

  const bytes = files.reduce((s, f) => s + f.size, 0);
  totalFiles += files.length;
  totalBytes += bytes;
  console.log(
    `\n${cfg.name} ${cfg.public ? "(публичный)" : "(приватный)"}: ` +
      `${files.length} файл(ов), ${human(bytes)}`,
  );

  if (DRY) {
    for (const f of files.slice(0, 5)) console.log(`   ${f.path} — ${human(f.size)}`);
    if (files.length > 5) console.log(`   … ещё ${files.length - 5}`);
    continue;
  }

  console.log(`   бакет ${await ensureBucket(cfg)}`);

  if (VERIFY) {
    const there = new Set((await listAll(dst, cfg.name)).map((f) => f.path));
    const missing = files.filter((f) => !there.has(f.path));
    console.log(
      missing.length === 0
        ? `   OK: все ${files.length} на месте`
        : `   !! не доехало: ${missing.length} — ${missing.slice(0, 5).map((f) => f.path).join(", ")}`,
    );
    if (missing.length) failures.push({ bucket: cfg.name, path: `${missing.length} файлов`, error: "отсутствуют" });
    continue;
  }

  // Что уже есть на приёмнике — чтобы повторный запуск не качал заново.
  const already = new Set((await listAll(dst, cfg.name)).map((f) => f.path));

  for (const f of files) {
    if (already.has(f.path)) {
      skipped++;
      continue;
    }
    try {
      const { data: blob, error: dlErr } = await src.storage.from(cfg.name).download(f.path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "пустой ответ");

      const { error: upErr } = await dst.storage
        .from(cfg.name)
        .upload(f.path, blob, { upsert: true, contentType: f.mime || undefined });
      if (upErr) throw new Error(upErr.message);

      copied++;
      process.stdout.write(`   ${copied} ${f.path}\n`);
    } catch (e) {
      failures.push({ bucket: cfg.name, path: f.path, error: e.message });
      console.error(`   !! ${f.path}: ${e.message}`);
    }
  }
}

// ── Итог ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`В облаке: ${totalFiles} файл(ов), ${human(totalBytes)}`);
if (!DRY && !VERIFY) console.log(`Перенесено: ${copied}, уже было: ${skipped}`);
if (failures.length) {
  console.log(`\nОшибок: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.bucket}/${f.path} — ${f.error}`);
  // Ненулевой код возврата: иначе частичный перенос в скрипте выглядел бы
  // как успешный, и недостающие документы нашлись бы уже у клиента.
  process.exit(1);
}
console.log(DRY ? "\nЭто был сухой прогон — ничего не изменено." : "\nГотово.");
