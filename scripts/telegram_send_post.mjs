import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArg = args.find((arg) => !arg.startsWith("--"));

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Не найден файл ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.description || `${response.status} ${response.statusText}`);
  }
  return json.result;
}

async function main() {
  if (!fileArg) {
    throw new Error("Укажите файл поста: node scripts/telegram_send_post.mjs path/to/post.html --apply");
  }

  loadEnv(path.resolve(".env.telegram.local"));

  const channel = process.env.TELEGRAM_CHANNEL;
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  if (!channel) throw new Error("TELEGRAM_CHANNEL не задан");

  const postPath = path.resolve(fileArg);
  const text = fs.readFileSync(postPath, "utf8").trim();
  if (!text) throw new Error("Файл поста пустой");
  if (text.length > 4096) throw new Error(`Пост длиннее лимита Telegram: ${text.length}`);

  console.log(`Channel: ${channel}`);
  console.log(`File: ${postPath}`);
  console.log(`Length: ${text.length}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);
  console.log("");
  console.log(text);
  console.log("");

  if (!apply) {
    console.log("Preview only. Add --apply to publish.");
    return;
  }

  const message = await telegram("sendMessage", new URLSearchParams({
    chat_id: channel,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  }));

  console.log(`Published: message_id=${message.message_id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
