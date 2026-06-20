import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Кнопка «наверх» — появляется после прокрутки.
 *
 * Только desktop (`hidden md:flex`): на мобиле правый нижний угол занят
 * QuickActionFAB (контактные действия), второй плавающей кнопкой не спорим.
 * Уважает prefers-reduced-motion (мгновенный скролл вместо плавного).
 */
const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Наверх"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`hidden md:flex fixed bottom-6 right-6 z-40 h-11 w-11 items-center justify-center
        border border-ink/80 bg-paper text-ink shadow-medium
        transition-all duration-300 hover:bg-ink hover:text-paper hover:border-gold
        ${visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"}`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
};

export default ScrollToTopButton;
