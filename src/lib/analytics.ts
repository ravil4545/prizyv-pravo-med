import { supabase } from "@/integrations/supabase/client";
import { ymGoal } from "./monitoring";

/**
 * Маркетинговая аналитика: захват UTM при первом визите + единая функция
 * trackEvent для целевых событий воронки.
 *
 * Базовая телеметрия (page_view, duration) уже идёт через useAnalyticsTracking.
 * Этот модуль покрывает конверсионные события: клики на CTA, заполнение форм,
 * trial, оплата.
 */

const SESSION_ID_KEY = "analytics_session_id";
const UTM_KEY = "analytics_utm";

interface UTM {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export const getSessionId = (): string => {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
};

/** Захват UTM при первом визите. Хранится в localStorage 30 дней. */
export const captureUTM = (search: string) => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(search);
  const utm: UTM = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
    const v = params.get(k);
    if (v) utm[k as keyof UTM] = v.slice(0, 128);
  });
  if (Object.keys(utm).length === 0) return;

  try {
    const stored = localStorage.getItem(UTM_KEY);
    // Не перезатираем first-touch — только записываем, если ещё пусто.
    if (stored) return;
    localStorage.setItem(
      UTM_KEY,
      JSON.stringify({ ...utm, captured_at: new Date().toISOString() }),
    );
  } catch {
    // ignore
  }
};

export const getUTM = (): UTM => {
  try {
    const stored = localStorage.getItem(UTM_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as UTM;
  } catch {
    return {};
  }
};

export type ConversionEvent =
  | "hero_cta_phone"
  | "hero_cta_trial"
  | "hero_cta_telegram"
  | "hero_cta_whatsapp"
  | "pricing_plan_view"
  | "pricing_plan_click"
  | "subscription_trial_click"
  | "subscription_plan_view"
  | "contact_form_open"
  | "contact_form_submit"
  | "lead_magnet_view"
  | "lead_magnet_submit"
  | "exit_intent_shown"
  | "exit_intent_submit"
  | "exit_intent_dismissed"
  | "scroll_50"
  | "scroll_75"
  | "scroll_100"
  | "faq_question_open"
  | "ai_chat_started"
  | "ai_question_asked"
  | "auth_signup"
  // Публичный ИИ-чат /ai (бесплатный вход в ценность до регистрации)
  | "hero_ai_ask"
  | "ai_public_open"
  | "ai_public_question"
  | "ai_public_gate_shown"
  | "ai_public_gate_signup_click"
  // Публичный разбор дела /razbor — единая дверь для холодного трафика (§2)
  | "case_review_submit"
  | "case_review_result"
  | "case_review_rate_limited"
  | "case_review_save_click"
  | "case_review_call_click"
  // Шаги воронки регистрации/входа (видеть, где именно бросают)
  | "auth_view"
  | "auth_oauth_click"
  | "auth_signup_submit"
  | "auth_signup_error"
  | "auth_signin_success";

interface TrackOptions {
  /** Уникальный id целевой сущности (тариф, статья, магнит). */
  ref?: string;
  /** Денежная или нумерическая ценность события. */
  value?: number;
}

/** Логирует целевое событие в analytics_events. Падение запроса не критично. */
export const trackEvent = (event: ConversionEvent, options: TrackOptions = {}) => {
  if (typeof window === "undefined") return;
  try {
    const utm = getUTM();
    const payload: Record<string, unknown> = {
      session_id: getSessionId(),
      event_type: event,
      page_url: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      event_ref: options.ref ?? null,
      event_value: options.value ?? null,
      utm_source: utm.utm_source ?? null,
      utm_medium: utm.utm_medium ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      utm_term: utm.utm_term ?? null,
      utm_content: utm.utm_content ?? null,
    };

    // Не дожидаемся ответа — fire-and-forget.
    // .then() обязателен — иначе ленивый билдер supabase-js v2 не отправит запрос.
    void supabase.from("analytics_events").insert(payload as never).then(() => {}, () => {});
    // Зеркалим в Яндекс.Метрику как JS-цель с тем же именем (no-op без счётчика).
    ymGoal(event);
  } catch {
    // ignore
  }
};

// ── Трекинг кликов ───────────────────────────────────────────────────────────
// Пишем каждый значимый клик (кнопка / ссылка / [data-track]) в analytics_events
// как event_type='click', event_ref = подпись элемента. Это даёт в админке «что
// кликают» (Метрика рисует визуальную карту, но не отдаёт queryable-данные).
// Собираем ТОЛЬКО подписи интерактивных элементов — никакого текста из полей ввода.
let lastClickKey = "";
let lastClickAt = 0;

const trackClick = (label: string, href?: string | null) => {
  const ref = (href ? `${label} → ${href}` : label).slice(0, 180);
  const key = window.location.pathname + "|" + ref;
  const now = Date.now();
  if (key === lastClickKey && now - lastClickAt < 1200) return; // дедуп быстрых повторов
  lastClickKey = key;
  lastClickAt = now;
  try {
    void supabase.from("analytics_events").insert({
      session_id: getSessionId(),
      event_type: "click",
      page_url: window.location.pathname,
      page_title: document.title,
      event_ref: ref,
      referrer: href || null,
      user_agent: navigator.userAgent,
      // .then() ОБЯЗАТЕЛЕН: в supabase-js v2 билдер «ленивый» — без await/.then()
      // запрос НЕ уходит. Из-за этого вся клиентская аналитика молчала с ~20.06.
    } as never).then(() => {}, () => {});
  } catch {
    // аналитика не должна ломать клики
  }
};

/** Глобальный перехват кликов по интерактивным элементам. Возвращает отписку. */
export const initClickTracking = (): (() => void) => {
  const onClick = (e: MouseEvent) => {
    // Клики самого админа (в /admin) не засоряют статистику реальных посетителей.
    if (window.location.pathname.startsWith("/admin")) return;
    const start = e.target as HTMLElement | null;
    const el = start?.closest<HTMLElement>("a, button, [role='button'], [data-track]");
    if (!el) return;
    const dataTrack = el.getAttribute("data-track");
    const aria = el.getAttribute("aria-label");
    let label = (dataTrack || aria || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) label = el.tagName.toLowerCase();
    const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
    trackClick(label.slice(0, 100), href);
  };
  document.addEventListener("click", onClick, { capture: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
};

/** Подключить scroll-depth трекинг. Возвращает функцию отписки. */
export const initScrollDepth = (): (() => void) => {
  const tracked = new Set<number>();
  const onScroll = () => {
    const doc = document.documentElement;
    const scrolled = (doc.scrollTop + window.innerHeight) / doc.scrollHeight;
    [0.5, 0.75, 1.0].forEach((threshold) => {
      if (scrolled >= threshold && !tracked.has(threshold)) {
        tracked.add(threshold);
        const event: ConversionEvent =
          threshold === 0.5 ? "scroll_50" : threshold === 0.75 ? "scroll_75" : "scroll_100";
        trackEvent(event);
      }
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
};
