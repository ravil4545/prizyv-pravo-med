/**
 * Внешний мониторинг: Sentry (ошибки фронта) + Яндекс.Метрика (поведение, воронка).
 *
 * ЧТОБЫ ВКЛЮЧИТЬ (оба сервиса бесплатны на старте):
 * 1. Метрика: metrika.yandex.ru → «Добавить счётчик» (сайт nepriziv.ru) →
 *    скопировать НОМЕР счётчика в YM_COUNTER_ID ниже.
 *    Цели создавать не нужно заранее: все события воронки (см. ConversionEvent
 *    в lib/analytics.ts) шлются как JS-цели с теми же именами — в Метрике
 *    достаточно завести цель типа «JavaScript-событие» с нужным идентификатором.
 * 2. Sentry: sentry.io → Create Project (React) → скопировать DSN в SENTRY_DSN.
 *
 * ⚠️ ПОРЯДОК ВКЛЮЧЕНИЯ SENTRY ВАЖЕН. Фильтр персональных данных
 * (lib/sentryScrub.ts) уже подключён через beforeSend/beforeBreadcrumb: он
 * вырезает ФИО, телефоны, email, паспорт, СНИЛС и полис, отрезает query-строку
 * (в /ai?q=… приезжает жалоба) и выбрасывает целиком ввод в поля, тело запроса
 * и произвольный контекст. Не отключайте его, вставляя DSN, — иначе медданные
 * клиентов уедут на серверы стороннего сервиса.
 *
 * Пока константы пустые — ни один скрипт не грузится, ничего не отправляется.
 * Вебвизор ВКЛЮЧЁН (записи сессий публичных страниц). Кабинет (DashboardLayout/
 * LawyerLayout/AdminLayout), формы входа и тексты ИИ-чатов помечены классом
 * `ym-hide-content` — их содержимое в записи скрывается; ввод в поля Метрика по
 * умолчанию не пишет. Так медданные (152-ФЗ) в записи сессий не попадают.
 */
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentryScrub";

export const YM_COUNTER_ID = 109765864; // счётчик Яндекс.Метрики nepriziv.ru
export const SENTRY_DSN = ""; // ← вставить DSN Sentry, например "https://…@….ingest.sentry.io/…"

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
  }
}

// Sentry подгружается динамически только при заданном DSN — не утяжеляет основной бандл.
let sentryPromise: Promise<typeof import("@sentry/react")> | null = null;
const loadSentry = () => {
  if (!sentryPromise) sentryPromise = import("@sentry/react");
  return sentryPromise;
};

let metrikaScriptRequested = false;
const METRIKA_SCRIPT_DELAY_MS = 6000;

const scheduleAfterLoad = (callback: () => void) => {
  const runWhenIdle = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 3000 });
    } else {
      globalThis.setTimeout(callback, 1200);
    }
  };

  if (document.readyState === "complete") {
    window.setTimeout(runWhenIdle, METRIKA_SCRIPT_DELAY_MS);
  } else {
    window.addEventListener("load", () => window.setTimeout(runWhenIdle, METRIKA_SCRIPT_DELAY_MS), { once: true });
  }
};

export function initMonitoring() {
  if (SENTRY_DSN) {
    loadSentry()
      .then((Sentry) => {
        Sentry.init({
          dsn: SENTRY_DSN,
          environment: import.meta.env.MODE,
          tracesSampleRate: 0.1,

          // ── Защита персональных данных (152-ФЗ) ──────────────────────────
          // Sentry по умолчанию кладёт в событие URL с query, ввод в поля,
          // тело запроса и произвольный контекст. На этом сайте всё это может
          // содержать диагноз, ФИО, паспорт и СНИЛС — специальную категорию
          // персональных данных. Без фильтров включать DSN нельзя.
          sendDefaultPii: false,
          beforeSend: (event) => scrubEvent(event as never) as never,
          beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as never,

          ignoreErrors: [
            // Протухший кеш после деплоя — уже обрабатывается авто-перезагрузкой
            "Failed to fetch dynamically imported module",
            "Importing a module script failed",
            "Loading chunk",
            "ResizeObserver loop",
            "AbortError",
          ],
        });
      })
      .catch(() => {
        // Мониторинг не должен ломать приложение
      });
  }

  if (YM_COUNTER_ID) injectMetrika(YM_COUNTER_ID);
}

function injectMetrika(id: number) {
  if (!window.ym) {
    const stub: YmFn = (...args: unknown[]) => {
      (stub.a = stub.a || []).push(args);
    };
    stub.l = Date.now();
    window.ym = stub;
  }
  window.ym(id, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true, // вкл; кабинет/формы/ИИ-чат скрыты классом ym-hide-content (152-ФЗ)
    defer: true, // hit'ы шлём сами на смену маршрута (SPA)
  });

  if (metrikaScriptRequested) return;
  metrikaScriptRequested = true;

  scheduleAfterLoad(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(s);
  });
}

/** SPA-просмотр страницы — вызывается на каждую смену маршрута (включая первый). */
export function ymHit(url: string) {
  if (YM_COUNTER_ID && window.ym) window.ym(YM_COUNTER_ID, "hit", url);
}

/** Цель Метрики. Имена целей = ConversionEvent из lib/analytics.ts. */
export function ymGoal(goal: string) {
  if (YM_COUNTER_ID && window.ym) window.ym(YM_COUNTER_ID, "reachGoal", goal);
}

/** Отправить ошибку в Sentry (no-op, если DSN не задан). */
export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  loadSentry()
    .then((Sentry) => Sentry.captureException(error, extra ? { extra } : undefined))
    .catch(() => {
      // ignore
    });
}
