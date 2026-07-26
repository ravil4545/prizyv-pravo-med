// ════════════════════════════════════════════════════════════════════════
//  Перевод VAPID-ключей из формата, в котором они лежат в Vault, в JWK.
//
//  В Vault ключи хранятся так, как их отдаёт генератор web-push:
//    vapid_public_key  — 65 байт (0x04 ‖ X ‖ Y) в base64url, 87 символов;
//    vapid_private_key — 32 байта скаляра d в base64url, 43 символа.
//
//  Библиотека @negrel/webpush ждёт от importVapidKeys объекты JsonWebKey.
//  В send-deadline-reminders строки передавались как есть — типы расходились,
//  а вызов падал внутри try/catch с сообщением «VAPID init skipped». То есть
//  web-push не работал с момента появления (июнь 2026) и молчал об этом:
//  e-mail уходили, push — нет, и никакой ошибки видно не было.
// ════════════════════════════════════════════════════════════════════════

/** base64url → байты. Отличается от base64 символами -_ и отсутствием '='. */
export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** байты → base64url без выравнивающих '='. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export interface VapidJwkPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

/**
 * Собирает пару JWK из base64url-строк Vault.
 *
 * Кривая всегда P-256: она задана спецификацией VAPID (RFC 8292), другие
 * браузеры не принимают.
 */
export function vapidKeysToJwk(publicKeyB64: string, privateKeyB64: string): VapidJwkPair {
  const pub = base64UrlToBytes(publicKeyB64.trim());
  const priv = base64UrlToBytes(privateKeyB64.trim());

  // Несжатая точка: первый байт 0x04, дальше по 32 байта на X и Y.
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(
      `vapid_public_key: ожидалась несжатая точка P-256 (65 байт, первый 0x04), ` +
        `получено ${pub.length} байт, первый 0x${pub[0]?.toString(16) ?? "??"}`,
    );
  }
  if (priv.length !== 32) {
    throw new Error(`vapid_private_key: ожидалось 32 байта скаляра, получено ${priv.length}`);
  }

  const x = bytesToBase64Url(pub.slice(1, 33));
  const y = bytesToBase64Url(pub.slice(33, 65));
  const d = bytesToBase64Url(priv);

  return {
    // ext: true — иначе importVapidKeys с { extractable: false } не сможет
    // сначала импортировать ключ, а потом пометить его неизвлекаемым.
    publicKey: { kty: "EC", crv: "P-256", x, y, ext: true },
    privateKey: { kty: "EC", crv: "P-256", x, y, d, ext: true },
  };
}
