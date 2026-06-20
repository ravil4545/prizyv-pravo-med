import fs from "node:fs";
import path from "node:path";
import { contentPlan } from "./telegram_content_plan.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const list = args.includes("--list");
const type = args.find((arg) => arg === "main" || arg === "short") || "main";
const envPath = path.resolve(".env.telegram.local");
const statePath = path.resolve("scripts/telegram-posts/state.json");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Не найден файл ${filePath}`);

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function loadState() {
  if (!fs.existsSync(statePath)) return { sent: {} };
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    body,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.description || `${response.status} ${response.statusText}`);
  }
  return json.result;
}

function getNextItem(state) {
  return contentPlan.find((item) => item.type === type && !state.sent[item.id]);
}

function moscowDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function alreadySentToday(state) {
  const today = moscowDateKey();
  return Object.entries(state.sent).find(([, sent]) => (
    sent.type === type && sent.published_local_date === today
  ));
}

function printQueue(state) {
  const rows = contentPlan
    .filter((item) => item.type === type)
    .map((item) => ({
      id: item.id,
      sent: Boolean(state.sent[item.id]),
      title: item.title,
    }));
  console.table(rows);
}

async function main() {
  loadEnv(envPath);
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  if (!process.env.TELEGRAM_CHANNEL) throw new Error("TELEGRAM_CHANNEL не задан");

  const state = loadState();
  if (list) {
    printQueue(state);
    return;
  }

  if (apply && !force) {
    const sentToday = alreadySentToday(state);
    if (sentToday) {
      const [sentId, sent] = sentToday;
      console.log(`Already published ${type} today: ${sentId}, message_id=${sent.message_id}`);
      console.log("Use --force to publish another post of the same type today.");
      return;
    }
  }

  const item = getNextItem(state);
  if (!item) {
    console.log(`No pending ${type} posts`);
    return;
  }
  if (item.text.length > 4096) {
    throw new Error(`${item.id} длиннее лимита Telegram: ${item.text.length}`);
  }

  console.log(`Channel: ${process.env.TELEGRAM_CHANNEL}`);
  console.log(`Type: ${type}`);
  console.log(`Next: ${item.id} — ${item.title}`);
  console.log(`Length: ${item.text.length}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);
  console.log("");
  console.log(item.text);
  console.log("");

  if (!apply) {
    console.log("Preview only. Add --apply to publish and mark as sent.");
    return;
  }

  const message = await telegram("sendMessage", new URLSearchParams({
    chat_id: process.env.TELEGRAM_CHANNEL,
    text: item.text,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  }));

  state.sent[item.id] = {
    message_id: message.message_id,
    published_at: new Date().toISOString(),
    published_local_date: moscowDateKey(),
    title: item.title,
    type: item.type,
  };
  saveState(state);

  console.log(`Published: ${item.id}, message_id=${message.message_id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
