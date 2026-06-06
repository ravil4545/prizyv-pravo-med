import { useEffect, useState } from "react";

export function useVisualViewportHeight(enabled = true) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setHeight(null);
      return;
    }

    const update = () => {
      const next = window.visualViewport?.height ?? window.innerHeight;
      setHeight(Math.round(next));
    };

    update();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled]);

  return height;
}
