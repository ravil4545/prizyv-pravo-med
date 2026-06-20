import fs from "node:fs";
import path from "node:path";
import { contentPlan } from "./telegram_content_plan.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repostProfile = args.includes("--repost-profile");
const idIndex = args.indexOf("--id");
const postId = idIndex >= 0 ? args[idIndex + 1] : args.find((arg) => !arg.startsWith("--"));
const envCandidates = [".env.vk.local", ".env.vk.local.env"];

function loadEnv() {
  const envPath = envCandidates.map((name) => path.resolve(name)).find((file) => fs.existsSync(file));
  if (!envPath) {
    throw new Error("Не найден .env.vk.local или .env.vk.local.env");
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  return envPath;
}

function htmlToVkText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/?(b|strong|i|em)>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function vk(method, params) {
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) {
    const error = json?.error;
    const message = error
      ? `${error.error_code}: ${error.error_msg}`
      : `${response.status} ${response.statusText}`;
    throw new Error(`${method}: ${message}`);
  }
  return json.response;
}

async function vkWithToken(method, params, token) {
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      v: process.env.VK_API_VERSION || "5.199",
      ...params,
    }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) {
    const error = json?.error;
    const message = error
      ? `${error.error_code}: ${error.error_msg}`
      : `${response.status} ${response.statusText}`;
    throw new Error(`${method}: ${message}`);
  }
  return json.response;
}

async function main() {
  const envPath = loadEnv();
  const token = process.env.VK_ACCESS_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  const version = process.env.VK_API_VERSION || "5.199";

  if (!token) throw new Error("VK_ACCESS_TOKEN не задан");
  if (!groupId) throw new Error("VK_GROUP_ID не задан");
  if (!postId) throw new Error("Укажите id поста, например: npm run vk:send -- --id main-001");

  const item = contentPlan.find((post) => post.id === postId);
  if (!item) throw new Error(`Пост ${postId} не найден`);

  const message = htmlToVkText(item.text);
  if (!message) throw new Error(`Пост ${postId} пустой после конвертации`);

  console.log(`Env: ${path.basename(envPath)}`);
  console.log(`VK group: ${groupId}`);
  console.log(`Post: ${item.id} — ${item.title}`);
  console.log(`Length: ${message.length}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);
  console.log(`Repost to profile: ${repostProfile ? "yes" : "no"}`);
  console.log("");
  console.log(message);
  console.log("");

  if (!apply) {
    console.log("Preview only. Add --apply to publish.");
    return;
  }

  const result = await vk("wall.post", {
    access_token: token,
    v: version,
    owner_id: `-${String(groupId).replace(/^-/, "")}`,
    from_group: "1",
    message,
  });

  console.log(`VK published: post_id=${result.post_id}`);

  if (repostProfile) {
    const userToken = process.env.VK_USER_ACCESS_TOKEN;
    if (!userToken) {
      throw new Error("VK_USER_ACCESS_TOKEN не задан. Пост опубликован в сообществе, но не продублирован на личную страницу.");
    }
    const object = `wall-${String(groupId).replace(/^-/, "")}_${result.post_id}`;
    const repost = await vkWithToken("wall.repost", { object }, userToken);
    console.log(`VK reposted to profile: object=${object}, post_id=${repost.post_id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
