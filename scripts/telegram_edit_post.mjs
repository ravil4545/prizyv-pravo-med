import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

function readOption(name) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return null;
}

function readFileArg() {
  const consumed = new Set(["--apply", "--message-id", "--photo"]);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") continue;
    if (arg.includes("=") && (arg.startsWith("--message-id=") || arg.startsWith("--photo="))) continue;
    if (consumed.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) return arg;
  }
  return null;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
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

function maskChannel(channel) {
  if (channel.startsWith("@")) return channel;
  return channel.length > 8 ? `${channel.slice(0, 4)}...${channel.slice(-4)}` : "***";
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
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
  const fileArg = readFileArg();
  const messageId = readOption("--message-id");
  const photoArg = readOption("--photo");

  if (!fileArg) {
    throw new Error("Usage: node scripts/telegram_edit_post.mjs path/to/post.html --message-id 383 --photo path/to/image.png --apply");
  }
  if (!messageId) throw new Error("Missing --message-id");

  loadEnv(path.resolve(".env.telegram.local"));

  const channel = process.env.TELEGRAM_CHANNEL;
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  if (!channel) throw new Error("TELEGRAM_CHANNEL is not set");

  const postPath = path.resolve(fileArg);
  const text = fs.readFileSync(postPath, "utf8").trim();
  if (!text) throw new Error("Post file is empty");

  const photoPath = photoArg ? path.resolve(photoArg) : null;
  if (photoPath && !fs.existsSync(photoPath)) throw new Error(`Photo not found: ${photoPath}`);
  if (photoPath && text.length > 1024) {
    throw new Error(`Telegram photo caption limit is 1024 characters, current length is ${text.length}`);
  }
  if (!photoPath && text.length > 4096) {
    throw new Error(`Telegram text limit is 4096 characters, current length is ${text.length}`);
  }

  console.log(`Channel: ${maskChannel(channel)}`);
  console.log(`Message: ${messageId}`);
  console.log(`File: ${postPath}`);
  console.log(`Photo: ${photoPath || "(no photo, text only)"}`);
  console.log(`Length: ${text.length}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);
  console.log("");
  console.log(text);
  console.log("");

  if (!apply) {
    console.log("Preview only. Add --apply to edit the Telegram message.");
    return;
  }

  if (photoPath) {
    const form = new FormData();
    form.append("chat_id", channel);
    form.append("message_id", messageId);
    form.append(
      "media",
      JSON.stringify({
        type: "photo",
        media: "attach://photo",
        caption: text,
        parse_mode: "HTML",
      }),
    );
    form.append("photo", new Blob([fs.readFileSync(photoPath)], { type: mimeFor(photoPath) }), path.basename(photoPath));

    await telegram("editMessageMedia", form);
    console.log("Edited media and caption.");
    return;
  }

  await telegram("editMessageText", new URLSearchParams({
    chat_id: channel,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  }));
  console.log("Edited text.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
