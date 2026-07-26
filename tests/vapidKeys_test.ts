/// <reference lib="deno.ns" />
// Тесты перевода VAPID-ключей в JWK. Запуск: deno test tests/
//
// Проверка не косметическая: пока строки base64url передавались в
// importVapidKeys как есть, вызов падал внутри try/catch, и web-push молча
// не работал с июня 2026 — письма уходили, push нет, ошибки не видно.

import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  vapidKeysToJwk,
} from "../supabase/functions/_shared/vapidKeys.ts";

/** Настоящая пара P-256, сгенерированная браузерным WebCrypto. */
async function generatePair() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwkPriv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { rawPub, jwkPriv };
}

Deno.test("base64url ходит туда и обратно без потерь", () => {
  for (const bytes of [
    new Uint8Array([0]),
    new Uint8Array([255, 254, 253]),
    new Uint8Array(Array.from({ length: 65 }, (_, i) => i * 3 % 256)),
  ]) {
    assertEquals(base64UrlToBytes(bytesToBase64Url(bytes)), bytes);
  }
});

Deno.test("base64url принимает строку без выравнивающих '='", () => {
  // Именно так ключи и лежат в Vault: 87 и 43 символа, без '='.
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const encoded = bytesToBase64Url(bytes);
  assertEquals(encoded.includes("="), false);
  assertEquals(base64UrlToBytes(encoded), bytes);
});

Deno.test("символы -_ разбираются как base64url, а не как base64", () => {
  // 0xFB 0xEF даёт '+' и '/' в обычном base64 и '-' '_' в base64url.
  const bytes = new Uint8Array([251, 239, 190]);
  const url = bytesToBase64Url(bytes);
  assertEquals(url.includes("+") || url.includes("/"), false);
  assertEquals(base64UrlToBytes(url), bytes);
});

Deno.test("настоящий ключ P-256 превращается в JWK, совпадающий с WebCrypto", async () => {
  const { rawPub, jwkPriv } = await generatePair();
  const pair = vapidKeysToJwk(bytesToBase64Url(rawPub), jwkPriv.d!);

  assertEquals(pair.publicKey.kty, "EC");
  assertEquals(pair.publicKey.crv, "P-256");
  // Координаты, восстановленные из сырой точки, обязаны совпасть с теми,
  // что WebCrypto отдаёт сам. Ошибка на байт здесь дала бы рабочий на вид
  // ключ и неверную подпись.
  assertEquals(pair.publicKey.x, jwkPriv.x);
  assertEquals(pair.publicKey.y, jwkPriv.y);
  assertEquals(pair.privateKey.d, jwkPriv.d);
});

Deno.test("полученный JWK принимается обратно WebCrypto", async () => {
  const { rawPub, jwkPriv } = await generatePair();
  const pair = vapidKeysToJwk(bytesToBase64Url(rawPub), jwkPriv.d!);

  // Главная проверка: ключ не просто «похож на JWK», а импортируется.
  const imported = await crypto.subtle.importKey(
    "jwk",
    pair.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  assertEquals(imported.type, "private");
});

Deno.test("мусор вместо ключа даёт понятную ошибку, а не молчание", () => {
  assertThrows(
    () => vapidKeysToJwk(bytesToBase64Url(new Uint8Array(10)), bytesToBase64Url(new Uint8Array(32))),
    Error,
    "vapid_public_key",
  );
  assertThrows(
    () => vapidKeysToJwk(bytesToBase64Url(new Uint8Array(65).fill(0).map((_, i) => (i === 0 ? 4 : 1))), "AAAA"),
    Error,
    "vapid_private_key",
  );
});

Deno.test("сжатая точка отвергается — VAPID требует несжатую", () => {
  const compressed = new Uint8Array(33);
  compressed[0] = 0x02; // признак сжатой формы
  assertThrows(
    () => vapidKeysToJwk(bytesToBase64Url(compressed), bytesToBase64Url(new Uint8Array(32))),
    Error,
    "vapid_public_key",
  );
});
