import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const objectIndex = args.indexOf("--object");
const object = objectIndex >= 0 ? args[objectIndex + 1] : "";

function loadVkEnv() {
  const envPath = [".env.vk.local", ".env.vk.local.env"]
    .map((file) => path.resolve(file))
    .find((file) => fs.existsSync(file));
  if (!envPath) throw new Error("Не найден .env.vk.local или .env.vk.local.env");

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return envPath;
}

async function vk(method, params, token) {
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
  const envPath = loadVkEnv();
  const userToken = process.env.VK_USER_ACCESS_TOKEN;
  const profileId = process.env.VK_PROFILE_ID || "282435357";

  if (!object) throw new Error("Укажите объект репоста: --object wall-82975206_366");
  if (!userToken) {
    throw new Error("VK_USER_ACCESS_TOKEN не задан. Для личной страницы нужен пользовательский токен с правом wall.");
  }

  console.log(`Env: ${path.basename(envPath)}`);
  console.log(`Profile: ${profileId}`);
  console.log(`Object: ${object}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);

  if (!apply) {
    console.log("Preview only. Add --apply to repost to the profile.");
    return;
  }

  const result = await vk("wall.repost", {
    object,
  }, userToken);
  console.log(`VK reposted to profile: post_id=${result.post_id}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
