import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const updateTitle = args.includes("--title");
const photoIndex = args.indexOf("--photo");
const photoPath = photoIndex >= 0 ? args[photoIndex + 1] : "";

const TITLE = "Непризыв по закону | юрист Важанина";
const STATUS = "Юрист по призывному и медицинскому праву. Бесплатный разбор: nepriziv.ru";
const DESCRIPTION = `Важанина Александра Евгеньевна
Юрист по призывному и медицинскому праву.

Законная помощь призывникам и семьям:
• повестки и медкомиссия
• Расписание болезней №565
• приобщение медицинских документов
• обжалование решений призывной комиссии
• суд и сопровождение по КАС РФ

Сайт: https://nepriziv.ru/
Справочник диагнозов: https://nepriziv.ru/diagnoses
Шаблоны документов: https://nepriziv.ru/templates

Бесплатный вводный разбор: https://nepriziv.ru/`;

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

async function vk(method, params, token = process.env.VK_ACCESS_TOKEN) {
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

async function uploadOwnerPhoto(groupId, filename) {
  const resolved = path.resolve(filename);
  if (!fs.existsSync(resolved)) throw new Error(`Фото не найдено: ${resolved}`);

  const token = process.env.VK_USER_ACCESS_TOKEN || process.env.VK_ACCESS_TOKEN;
  const uploadServer = await vk("photos.getOwnerPhotoUploadServer", {
    owner_id: `-${String(groupId).replace(/^-/, "")}`,
  }, token);

  const form = new FormData();
  const blob = new Blob([fs.readFileSync(resolved)]);
  form.set("photo", blob, path.basename(resolved));

  const uploadResponse = await fetch(uploadServer.upload_url, {
    method: "POST",
    body: form,
  });
  const uploaded = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploaded?.photo) {
    throw new Error(`photo upload: ${uploaded?.error || uploadResponse.statusText}`);
  }

  return vk("photos.saveOwnerPhoto", {
    server: String(uploaded.server),
    hash: uploaded.hash,
    photo: uploaded.photo,
  }, token);
}

async function main() {
  const envPath = loadVkEnv();
  const groupId = process.env.VK_GROUP_ID;
  if (!process.env.VK_ACCESS_TOKEN) throw new Error("VK_ACCESS_TOKEN не задан");
  if (!groupId) throw new Error("VK_GROUP_ID не задан");

  console.log(`Env: ${path.basename(envPath)}`);
  console.log(`Group: ${groupId}`);
  console.log(`Mode: ${apply ? "apply" : "preview"}`);
  console.log(`Update title: ${updateTitle ? "yes" : "no"}`);
  console.log(`Photo: ${photoPath || "not set"}`);
  console.log("");
  console.log("Status:");
  console.log(STATUS);
  console.log("");
  console.log("Description:");
  console.log(DESCRIPTION);
  console.log("");

  if (!apply) {
    console.log("Preview only. Add --apply to update VK.");
    return;
  }

  const editParams = {
    group_id: String(groupId).replace(/^-/, ""),
    description: DESCRIPTION,
    website: "https://nepriziv.ru/",
  };
  if (updateTitle) editParams.title = TITLE;

  await vk("groups.edit", editParams);
  console.log("VK group description/website checked");

  try {
    await vk("status.set", {
      group_id: String(groupId).replace(/^-/, ""),
      text: STATUS,
    }, process.env.VK_USER_ACCESS_TOKEN || process.env.VK_ACCESS_TOKEN);
    console.log("VK group status updated");
  } catch (error) {
    console.warn(`VK group status not updated: ${error.message}`);
    console.warn("VK may require an admin user token for status.set.");
  }

  if (photoPath) {
    await uploadOwnerPhoto(groupId, photoPath);
    console.log("VK group photo updated");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
