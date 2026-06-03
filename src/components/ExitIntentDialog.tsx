import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X, Send, ArrowRight, FileDown, MessageCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "exit_intent_shown_v1";

// PDF, который отдаём при подписке через exit-intent.
// Файл лежит в public/leadmagnets/ и генерируется scripts/generate_leadmagnets.py.
const EXIT_INTENT_PDF = {
  url: "/leadmagnets/checklist-medcomission.pdf",
  title: "Чек-лист подготовки к медкомиссии",
};

// Маршруты, где попап не показываем — иначе перебиваем критичные сценарии (форма, оплата).
const BLOCKED_PATHS = [
  "/auth",
  "/login",
  "/register",
  "/reset-password",
  "/dashboard",
  "/lawyer",
  "/admin",
  "/client",
  "/profile",
  "/pay",
];

const isBlockedPath = (pathname: string): boolean =>
  BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

const ExitIntentDialog = () => {
  const { user } = useAuth();
  const branding = useBranding();
  const location = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Не показываем: залогиненным, на чувствительных страницах, если уже видели в сессии.
    if (user) return;
    if (isBlockedPath(location.pathname)) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // ignore
    }

    let dismissed = false;
    let mobileTimer: number | undefined;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    const trigger = () => {
      if (dismissed) return;
      dismissed = true;
      setOpen(true);
      trackEvent("exit_intent_shown");
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    };

    // Desktop: классический exit-intent — курсор уходит за верхнюю границу.
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger();
    };

    // Mobile: вместо «попапа через 35с» — аналог exit-intent. Показываем, когда
    // пользователь прокрутил вглубь и вернулся вверх (жест «ухожу»), либо мягкий
    // запасной таймер 60с. Так попап не перебивает чтение в первые секунды и
    // ловит именно вовлечённого читателя, который собрался уходить.
    let maxScroll = 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > maxScroll) maxScroll = y;
      if (maxScroll > 800 && y < maxScroll - 400) trigger();
    };

    if (isMobile) {
      window.addEventListener("scroll", onScroll, { passive: true });
      mobileTimer = window.setTimeout(trigger, 60000);
    } else {
      document.addEventListener("mouseleave", onMouseLeave);
    }

    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScroll);
      if (mobileTimer) window.clearTimeout(mobileTimer);
    };
  }, [user, location.pathname]);

  const handleTelegram = () => {
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
  };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent("Хочу получить чек-лист подготовки призывника...");
    const wa = branding.whatsapp || "79253500533";
    window.open(`https://wa.me/${wa}?text=${msg}`, "_blank");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedPhone = phone.trim();
    const cleanedEmail = email.trim();
    if (cleanedPhone.length < 10 && cleanedEmail.length < 5) {
      toast({
        variant: "destructive",
        title: "Укажите телефон или email",
        description: "Нужен хотя бы один контакт, чтобы прислать материалы.",
      });
      return;
    }
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: {
          name: "Лид с попапа",
          phone: cleanedPhone || "+70000000000",
          email: cleanedEmail || "",
          message: "Запрос чек-листа «5 ошибок призывника» через exit-intent попап.",
          source: "exit_intent",
        },
      });

      if (error) throw new Error(error.message || "Ошибка отправки");
      if (!data?.success) throw new Error(data?.message || "Ошибка обработки");

      trackEvent("exit_intent_submit");
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Попробуйте ещё раз";
      toast({
        variant: "destructive",
        title: "Не удалось отправить",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="relative w-full max-w-lg bg-ink text-paper border border-gold overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center text-paper/60 hover:text-gold transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-7 sm:p-9">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 00</span>
            <span className="font-mono text-gold/70 text-[10px] tracking-[0.25em] uppercase">
              Подарок при уходе
            </span>
          </div>

          {submitted ? (
            <>
              <h3 id="exit-intent-title" className="font-serif text-3xl sm:text-4xl leading-tight mb-3">
                Готово.
              </h3>
              <p className="text-sm text-paper/75 leading-relaxed mb-5">
                Скачайте PDF прямо сейчас — копия пришла на ваш email на случай, если
                захотите вернуться к материалу позже.
              </p>

              {/* Основная кнопка — прямое скачивание PDF */}
              <a
                href={EXIT_INTENT_PDF.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="group flex items-center justify-between gap-3 w-full px-5 py-4 bg-gold text-ink font-semibold text-sm mb-4 hover:bg-paper transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Скачать PDF — {EXIT_INTENT_PDF.title}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>

              <p className="text-xs text-paper/55 uppercase tracking-wider font-mono mb-3">
                Или связаться напрямую:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleTelegram}
                  className="group flex items-center justify-between gap-2 px-4 py-3 border border-paper/30 text-paper text-sm font-medium hover:border-gold hover:text-gold transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Telegram
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="group flex items-center justify-between gap-2 px-4 py-3 border border-paper/30 text-paper text-sm font-medium hover:border-gold hover:text-gold transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 id="exit-intent-title" className="font-serif text-2xl sm:text-3xl leading-tight mb-3">
                Не уходите так —
                <span className="block italic text-gold font-light mt-1">
                  заберите чек-лист бесплатно.
                </span>
              </h3>
              <div className="flex items-center gap-3 mb-5 p-3 bg-gold/10 border border-gold/30">
                <FileDown className="h-5 w-5 text-gold flex-shrink-0" />
                <p className="text-sm text-paper/90 leading-snug">
                  «{EXIT_INTENT_PDF.title}» — PDF с 9 пунктами подготовки и типичными ошибками,
                  которые я вижу в своей практике.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label htmlFor="exit-phone" className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/70 block mb-1.5">
                    Телефон
                  </label>
                  <input
                    id="exit-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 (999) 123-45-67"
                    maxLength={18}
                    className="w-full bg-paper/5 border border-paper/25 px-4 py-3 text-paper placeholder:text-paper/35 focus:outline-none focus:border-gold transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="exit-email" className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/70 block mb-1.5">
                    Email <span className="text-paper/40">(необязательно)</span>
                  </label>
                  <input
                    id="exit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    maxLength={255}
                    className="w-full bg-paper/5 border border-paper/25 px-4 py-3 text-paper placeholder:text-paper/35 focus:outline-none focus:border-gold transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="group inline-flex items-center justify-between w-full gap-3 px-5 py-3.5 bg-gold text-ink font-semibold text-sm hover:bg-paper transition-colors disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <FileDown className="h-4 w-4" />
                    {submitting ? "Отправляем..." : "Получить чек-лист"}
                  </span>
                  {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </button>

                <p className="text-[10px] text-paper/55 leading-relaxed">
                  Без спама. Только материал и одно письмо с уточнением вашей ситуации.
                  Согласие на обработку ПДн — нажатием кнопки.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExitIntentDialog;
