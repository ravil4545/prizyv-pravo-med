/* Service Worker для web-push (Модуль 4 Фаза 3b).
 *
 * Минимальный SW: только push-уведомления о дедлайнах. Не кэширует ресурсы,
 * чтобы не мешать обычной работе SPA и деплоям (нет offline-стратегий).
 */

self.addEventListener("install", (event) => {
  // Активируем новую версию SW сразу, без ожидания закрытия вкладок.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Непризыв", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Напоминание о деле";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || "nepriziv-deadline",
    data: { url: data.url || "/dashboard/calendar" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard/calendar";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Если вкладка с сайтом уже открыта — фокусируем и ведём на нужный путь.
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
