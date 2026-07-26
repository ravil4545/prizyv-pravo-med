#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  Резервная копия базы знаний и смежных инструментов.
//
//  Запуск:
//    node scripts/backup_knowledge.mjs              — сделать копию
//    node scripts/backup_knowledge.mjs --dry-run    — только показать план
//    node scripts/backup_knowledge.mjs --check      — проверить ПДн и выйти
//
//  ЗАЧЕМ ОТДЕЛЬНО ОТ selfhost/backup.ps1. Тот скрипт снимает локальный
//  Supabase и привязан к переезду. Этот работает уже сегодня и закрывает
//  другой риск: канонический волт SecondBrain, конвейер курации и
//  автопостинг живут в одном экземпляре на одном диске.
//
//  ЧТО СЮДА НЕ ПОПАДАЕТ И ПОЧЕМУ. C:\Аудио (записи консультаций) и
//  hermes-tools (выгрузки amoCRM) содержат персональные данные клиентов.
//  Незашифрованная копия на соседнем диске их не защищает, а размножает.
//  Для них нужен шифрованный контейнер — это отдельное решение.
//
//  ПЕРЕД АРХИВАЦИЕЙ идёт проверка на ПДн. Если в источнике, помеченном
//  как обезличенный, найдутся телефон, email или ФИО с отчеством —
//  скрипт останавливается. Смысл в том, чтобы копия не стала способом
//  тихо вынести персональные данные в новое место.
// ════════════════════════════════════════════════════════════════════════

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const DRY = process.argv.includes("--dry-run");
const CHECK_ONLY = process.argv.includes("--check");

/** Куда класть: том, отличный от того, где лежат данные. */
const TARGET_CANDIDATES = ["E:", "G:", "C:"];
const KEEP_COPIES = 10;

// Уровень чувствительности задаёт, что делать при находке ПДн:
//   strict — данных быть не должно вообще, находка ОСТАНАВЛИВАЕТ копирование;
//   own    — допустимы контакты самого владельца (имя юриста в брендинге,
//            его почта в служебных логах), находка только предупреждает;
//   raw    — сырой слой, ПДн там по определению, проверка не нужна.
const SOURCES = [
  { name: "secondbrain", path: "D:\\Obsidian\\SecondBrain", level: "strict" },
  { name: "obsidian-main", path: "D:\\Obsidian\\Main", level: "raw" },
  { name: "social-autoposting", path: "C:\\nepriziv Claude project\\social-autoposting", level: "own" },
  { name: "curation", path: "C:\\Аудио\\Claude_SecondBrain_Curation", level: "own" },
];

// ── Детектор ПДн ────────────────────────────────────────────────────────
// Lookaround вместо \b: в JavaScript \b определяется через \w = [A-Za-z0-9_],
// поэтому кириллица словом не считается и обычный \b тут просто не сработает.
const PII_RULES = [
  ["телефон", /(?:\+7|\b8)[\s(-]?\d{3}[\s)-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ["ФИО с отчеством", /(?<![А-Яа-яЁё])[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:вич|вна|ична)(?![А-Яа-яЁё])/g],
];
const TEXT_EXT = [".md", ".txt", ".json", ".py", ".yaml", ".yml", ".js", ".mjs", ".ts"];
const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", ".obsidian", "venv", ".venv"]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (TEXT_EXT.some((x) => e.name.toLowerCase().endsWith(x))) out.push(p);
  }
  return out;
}

function scanPii(root) {
  const found = [];
  for (const abs of walk(root)) {
    let text;
    try {
      if (statSync(abs).size > 5 * 1024 * 1024) continue;
      text = readFileSync(abs, "utf8");
    } catch { continue; }
    const hits = [];
    for (const [name, re] of PII_RULES) {
      const m = text.match(re);
      if (m?.length) hits.push(`${name}×${m.length}`);
    }
    // Содержимое НЕ выводим — только имя файла и типы находок.
    if (hits.length) found.push({ file: relative(root, abs).replaceAll("\\", "/"), hits });
  }
  return found;
}

// ── Выбор диска ─────────────────────────────────────────────────────────
function pickTarget() {
  for (const d of TARGET_CANDIDATES) {
    if (!existsSync(d + "\\")) continue;
    const s = statfsSync(d + "\\");
    if (s.bavail * s.bsize > 5 * 1024 ** 3) return d;
  }
  return null;
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} МБ`;

// ── Проверка ────────────────────────────────────────────────────────────
console.log("Проверка источников на персональные данные\n");
let blocked = false;
for (const src of SOURCES) {
  if (!existsSync(src.path)) { console.log(`  ПРОПУСК (нет папки): ${src.path}`); continue; }

  if (src.level === "raw") {
    console.log(`  ${src.name}: сырой слой, проверка не применяется`);
    continue;
  }

  const found = scanPii(src.path);
  if (found.length === 0) {
    console.log(`  ${src.name}: чисто`);
    continue;
  }

  const strict = src.level === "strict";
  console.log(
    `  ${src.name}: ${strict ? "НАЙДЕНЫ ПДн" : "находки (ожидаются контакты владельца)"} ` +
      `в ${found.length} файл(ах):`,
  );
  for (const f of found.slice(0, 10)) console.log(`      ${f.file} — ${f.hits.join(", ")}`);
  if (found.length > 10) console.log(`      … ещё ${found.length - 10}`);
  if (strict) blocked = true;
}

if (blocked) {
  console.log(
    "\nОстановлено: в источнике уровня strict нашлись персональные данные.\n" +
      "Либо вычистите находки, либо осознанно понизьте уровень — но тогда\n" +
      "копия должна лежать в шифрованном виде, а не просто на соседнем диске.",
  );
  process.exit(1);
}
if (CHECK_ONLY) { console.log("\n--check: проверка пройдена, архивы не создавались."); process.exit(0); }

// ── Архивация ───────────────────────────────────────────────────────────
const target = pickTarget();
if (!target) { console.error("Нет тома с 5+ ГБ свободного места."); process.exit(1); }

const stamp = new Date().toISOString().slice(0, 10);
const dst = `${target}\\backups\\knowledge\\${stamp}`;
console.log(`\nЦель: ${dst}`);

if (DRY) {
  for (const s of SOURCES) if (existsSync(s.path)) console.log(`  [сухой прогон] ${s.name} ← ${s.path}`);
  process.exit(0);
}

mkdirSync(dst, { recursive: true });
const report = [];
for (const src of SOURCES) {
  if (!existsSync(src.path)) continue;
  const zip = `${dst}\\${src.name}.zip`;
  try {
    execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `Compress-Archive -Path '${src.path}\\*' -DestinationPath '${zip}' -Force`],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 900_000 },
    );
    const size = statSync(zip).size;
    // Пустой архив — признак того, что путь есть, а содержимого нет.
    if (size < 1024) throw new Error(`архив подозрительно мал (${size} б)`);
    console.log(`  OK  ${src.name}.zip — ${mb(size)}`);
    report.push({ ...src, zip, bytes: size });
  } catch (e) {
    console.error(`  !!  ${src.name}: ${String(e.stderr || e.message).slice(0, 200)}`);
  }
}

writeFileSync(
  `${dst}\\README.txt`,
  [
    `Резервная копия базы знаний — ${stamp}`,
    "",
    ...report.map((r) => `  ${r.name}.zip  <-  ${r.path}  (${mb(r.bytes)})`),
    "",
    "Чего здесь НЕТ и почему:",
    "  C:\\Аудио — записи и транскрипты реальных консультаций, персональные",
    "    данные. Незашифрованная копия проблему размножает, а не решает.",
    "  hermes-tools — выгрузки amoCRM с телефонами и ФИО клиентов, в том",
    "    числе в истории git.",
    "",
    "ЭТО НЕ ВНЕШНИЙ БЭКАП. Копия лежит на другом ТОМЕ той же машины:",
    "спасает от случайного удаления и отказа одного диска, но не от кражи,",
    "пожара и шифровальщика. Следующий шаг — выгрузка за пределы компьютера.",
    "",
    `Создано ${new Date().toISOString()}`,
  ].join("\r\n"),
  "utf8",
);

// ── Ротация ─────────────────────────────────────────────────────────────
const root = `${target}\\backups\\knowledge`;
const copies = readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
  .map((e) => e.name)
  .sort();
for (const old of copies.slice(0, Math.max(0, copies.length - KEEP_COPIES))) {
  rmSync(join(root, old), { recursive: true, force: true });
  console.log(`  удалена старая копия ${old}`);
}

const total = report.reduce((s, r) => s + r.bytes, 0);
console.log(`\nГотово: ${report.length} архив(ов), ${mb(total)}. Хранится копий: ${Math.min(copies.length, KEEP_COPIES)}.`);
if (report.length === 0) process.exit(1);
