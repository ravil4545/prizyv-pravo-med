import { useEffect } from "react";

/**
 * Появление элементов при скролле — лёгкая editorial-анимация (fade + подъём).
 *
 * SEO-safe: по умолчанию контент ВИДИМ. Класс `.reveal-init` (прячущий) вешает
 * JS только если он поддержан и пользователь не просил снизить анимацию —
 * значит в SEO-пререндере и при выключённом JS всё видно для краулеров.
 *
 * Прячем только то, что СЕЙЧАС заметно ниже вьюпорта, чтобы не было «вспышки»
 * у контента, который уже на первом экране.
 *
 * @param rootRef   контейнер, чьих прямых детей наблюдаем
 * @param skipFirst сколько первых детей пропустить (напр. Hero — он над сгибом)
 */
export function useScrollReveal(
  rootRef: React.RefObject<HTMLElement>,
  skipFirst = 0,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = Array.from(root.children).slice(skipFirst) as HTMLElement[];
    const vh = window.innerHeight;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    // Мгновенно проявляем секцию, если в неё пришёл фокус с клавиатуры — иначе
    // фокус ушёл бы на ещё невидимый (opacity:0) элемент (WCAG 2.4.7).
    const revealNow = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      el.classList.add("reveal-in");
      observer.unobserve(el);
    };

    const touched: HTMLElement[] = [];
    for (const el of items) {
      if (el.getBoundingClientRect().top > vh * 0.9) {
        el.classList.add("reveal-init");
        observer.observe(el);
        el.addEventListener("focusin", revealNow, { once: true });
        touched.push(el);
      }
    }

    return () => {
      observer.disconnect();
      for (const el of touched) {
        el.removeEventListener("focusin", revealNow);
        el.classList.remove("reveal-init", "reveal-in");
      }
    };
  }, [rootRef, skipFirst]);
}
