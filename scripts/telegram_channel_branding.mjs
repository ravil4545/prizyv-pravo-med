import fs from "node:fs";
import path from "node:path";

const ENV_FILE = ".env.telegram.local";

const CHANNEL_TITLE = "Непризыв по закону | юрист Важанина";
const CHANNEL_DESCRIPTION =
  "Юрист по призывному и медицинскому праву. Документы, медкомиссия, Расписание болезней №565, военкомат и суд. Бесплатный разбор: nepriziv.ru";

const PINNED_POST = `<b>Важанина Александра Евгеньевна</b>
Юрист по призывному и медицинскому праву.

Здесь разбираю призыв по закону, без серых схем:

• повестки и медкомиссия
• Расписание болезней №565
• приобщение медицинских документов
• обжалование решений призывной комиссии
• суд и сопровождение по КАС РФ

Полезные разделы:
Сайт: https://nepriziv.ru/
Справочник диагнозов: https://nepriziv.ru/diagnoses
Шаблоны документов: https://nepriziv.ru/templates

Бесплатный вводный разбор: https://nepriziv.ru/`;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const updateTitle = args.includes("--title");
const noPin = args.includes("--no-pin");
const noPost = args.includes("--no-post");
const photoIndex = args.indexOf("--photo");
const photoPath = photoIndex >= 0 ? args[photoIndex + 1] : "";

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
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

async function telegram(method, body, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    const description = json?.description || `${response.status} ${response.statusText}`;
    if (options.ignoreNotModified && description.includes("not modified")) {
      return null;
    }
    throw new Error(`${method}: ${description}`);
  }
  return json.result;
}

async function setChatPhoto(chatId, filename) {
  const resolved = path.resolve(filename);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Не найден файл фото: ${resolved}`);
  }

  const form = new FormData();
  form.set("chat_id", chatId);
  const blob = new Blob([fs.readFileSync(resolved)]);
  form.set("photo", blob, path.basename(resolved));
  return telegram("setChatPhoto", form);
}

function printPreview(channel) {
  console.log("Telegram channel branding preview");
  console.log("");
  console.log(`Channel: ${channel}`);
  console.log(`Apply mode: ${apply ? "yes" : "no, preview only"}`);
  console.log(`Update title: ${updateTitle ? "yes" : "no"}`);
  console.log(`Publish pinned-post candidate: ${noPost ? "no" : "yes"}`);
  console.log(`Pin message: ${noPin || noPost ? "no" : "yes"}`);
  console.log(`Photo: ${photoPath || "not set"}`);
  console.log("");
  console.log("Title candidate:");
  console.log(CHANNEL_TITLE);
  console.log("");
  console.log("Description:");
  console.log(CHANNEL_DESCRIPTION);
  console.log("");
  console.log("Pinned post:");
  console.log(PINNED_POST);
  console.log("");
}

async function main() {
  loadEnv(path.resolve(ENV_FILE));

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_CHANNEL;

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  if (!channel) throw new Error("TELEGRAM_CHANNEL не задан");
  if (CHANNEL_DESCRIPTION.length > 255) {
    throw new Error(`Описание длиннее 255 символов: ${CHANNEL_DESCRIPTION.length}`);
  }
  if (CHANNEL_TITLE.length > 128) {
    throw new Error(`Название длиннее 128 символов: ${CHANNEL_TITLE.length}`);
  }

  printPreview(channel);

  if (!apply) {
    console.log("Preview only. To apply: npm run telegram:apply");
    console.log("With title: npm run telegram:apply -- --title");
    console.log("With photo: npm run telegram:apply -- --photo public/lawyer-portrait.jpg");
    console.log("Photo/description only: npm run telegram:apply -- --no-post --photo public/telegram-avatar.jpg");
    return;
  }

  const me = await telegram("getMe", new URLSearchParams());
  console.log(`Bot connected: @${me.username}`);

  if (updateTitle) {
    await telegram("setChatTitle", new URLSearchParams({
      chat_id: channel,
      title: CHANNEL_TITLE,
    }));
    console.log("Channel title updated");
  }

  await telegram("setChatDescription", new URLSearchParams({
    chat_id: channel,
    description: CHANNEL_DESCRIPTION,
  }), { ignoreNotModified: true });
  console.log("Channel description checked");

  if (photoPath) {
    await setChatPhoto(channel, photoPath);
    console.log("Channel photo updated");
  }

  if (noPost) {
    console.log("Post publishing skipped");
    return;
  }

  const message = await telegram("sendMessage", new URLSearchParams({
    chat_id: channel,
    text: PINNED_POST,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  }));
  console.log(`Pinned-post candidate published: message_id=${message.message_id}`);

  if (!noPin) {
    try {
      await telegram("pinChatMessage", new URLSearchParams({
        chat_id: channel,
        message_id: String(message.message_id),
        disable_notification: "true",
      }));
      console.log("Message pinned");
    } catch (error) {
      console.warn(`Could not pin message: ${error.message}`);
      console.warn("Give the bot pin-message/admin rights or pin it manually.");
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
