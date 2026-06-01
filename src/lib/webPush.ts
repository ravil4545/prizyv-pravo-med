import { supabase } from "@/integrations/supabase/client";

/**
 * Web-push клиент (Модуль 4 Фаза 3b).
 *
 * Регистрирует service worker, запрашивает разрешение, оформляет подписку в
 * браузере и сохраняет её в public.push_subscriptions. Публичный VAPID-ключ
 * не секретный — используется на клиенте. Приватный живёт в Vault и нужен
 * только edge-функции отправки.
 */

// Публичный VAPID-ключ (парный к приватному в Vault: vapid_private_key).
export const VAPID_PUBLIC_KEY =
  "BM2H0wXiuiin7fsGJZiLUd06BKNO1kGByQ0SC43W8ld2TC9miXvqY1AQ0yTRIRhL_RF62_NPeTaEQKSVmzO6jzk";

const SW_URL = "/push-sw.js";

export const isPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const pushPermission = (): NotificationPermission | "unsupported" =>
  isPushSupported() ? Notification.permission : "unsupported";

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const registerSw = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
};

/**
 * Полный путь подписки: разрешение → SW → PushManager → запись в БД.
 * Возвращает { ok, reason } — reason для UX-сообщений.
 */
export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { ok: false, reason: "no-auth" };

  try {
    const reg = await registerSw();
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
    const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));

    // push_subscriptions ещё нет в сгенерированных типах (миграция свежая) — каст.
    const { error } = await (supabase as any)
      .from("push_subscriptions")
      .upsert(
        {
          user_id: session.user.id,
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (error) {
      console.error("push subscribe save error", error);
      return { ok: false, reason: "save-failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("push subscribe error", e);
    return { ok: false, reason: "error" };
  }
}

/** Отписка: убираем подписку из браузера и из БД. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await (supabase as any).from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return true;
  } catch (e) {
    console.error("push unsubscribe error", e);
    return false;
  }
}
