import { useNavigate } from "react-router-dom";
import { Phone, MessageCircle, Send, Bot, Sparkles, ArrowRight, ShieldCheck, Clock, Lock } from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";
import BrandedAvatar from "@/components/BrandedAvatar";
import { trackEvent } from "@/lib/analytics";

const Hero = () => {
  const navigate = useNavigate();
  const branding = useBranding();

  const nameParts = branding.displayName.trim().split(/\s+/);
  const initialsShort = nameParts.length >= 2
    ? `${nameParts[1][0]}. ${nameParts[0]}`
    : branding.displayName;

  const phoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");
  const dashboardHome = `${branding.routePrefix}/dashboard`;
  const trialPath = `${branding.routePrefix}/auth?next=${encodeURIComponent(`${dashboardHome}?pay=trial`)}`;

  const handlePhoneCall = () => {
    trackEvent("hero_cta_phone");
    window.location.href = `tel:+${phoneDigits}`;
  };

  const handleWhatsApp = () => {
    trackEvent("hero_cta_whatsapp");
    const msg = encodeURIComponent(
      `Здравствуйте! Мне нужна консультация по призыву...`
    );
    const wa = branding.whatsapp || "79253500533";
    window.open(`https://wa.me/${wa}?text=${msg}`, "_blank");
  };

  const handleTelegram = () => {
    trackEvent("hero_cta_telegram");
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
  };

  const handleTrial = () => {
    trackEvent("hero_cta_trial");
    navigate(trialPath);
  };

  return (
    <section
      className="relative bg-ink text-paper overflow-hidden"
      aria-label="Главная информация"
    >
      {/* Background paper texture (subtle gold dots over ink) */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--gold)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />

      {/* Decorative side rule (left) */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-gold/30 hidden lg:block" aria-hidden />
      {/* Decorative side rule (right) */}
      <div className="absolute right-6 top-0 bottom-0 w-px bg-gold/30 hidden lg:block" aria-hidden />

      {/* Top archival label */}
      <div className="relative border-b border-gold/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-3 flex items-center justify-between text-[10px] sm:text-xs font-mono tracking-[0.2em] text-gold/80 uppercase">
          <span>досье · юрист.ва · est. 2014</span>
          <span className="hidden sm:inline">RU · защита призывников · конфиденциально</span>
          <span className="sm:hidden">конфиденциально</span>
        </div>
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 md:py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left: editorial content */}
          <div className="lg:col-span-7">
            {/* Eyebrow — section number + lawyer's name */}
            <div className="flex items-center gap-3 mb-5">
              <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 01</span>
              <span className="h-px flex-1 bg-gold/30 max-w-[80px]" />
              <span className="font-mono text-gold/80 text-[10px] sm:text-xs tracking-[0.25em] uppercase truncate">
                {branding.displayName} · {branding.subtitle.toLowerCase()}
              </span>
            </div>

            {/* Selling headline — outcome-first */}
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.02] mb-5 sm:mb-6">
              Юридический разбор вашего дела —
              <span className="block italic font-light text-gold mt-1">
                по закону, без серых схем.
              </span>
            </h1>

            {/* Selling subtitle — concrete numbers + guarantee */}
            <p className="text-base sm:text-lg md:text-xl text-paper/85 leading-relaxed max-w-xl mb-6 sm:mb-8">
              <span className="font-semibold text-paper">10 лет практики</span> в призывном праве. Анализирую
              медицинские документы и личное дело, выстраиваю защиту на нормах права — по всей РФ.
              <span className="block mt-2 text-paper/70 text-sm sm:text-base">
                От первой повестки до итогового решения призывной комиссии и суда.
              </span>
            </p>

            {/* Trust-bar — moved above the fold, before CTAs */}
            <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-8 pb-8 border-b border-paper/15">
              {[
                { num: "10+", label: "лет практики" },
                { num: "500+", label: "дел в практике" },
                { num: "88", label: "статей №565" },
              ].map((t) => (
                <div key={t.label}>
                  <div className="font-serif text-2xl sm:text-3xl md:text-4xl text-gold leading-none">
                    {t.num}
                  </div>
                  <div className="text-[10px] sm:text-xs text-paper/65 mt-1.5 leading-snug">
                    {t.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Two equal CTAs — same visual weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mb-5">
              <button
                onClick={handlePhoneCall}
                className="group flex items-center justify-between px-5 sm:px-6 py-4 bg-gold text-ink font-semibold text-sm sm:text-base hover:bg-gold-deep hover:text-paper transition-all duration-300"
              >
                <span className="flex items-center gap-2.5">
                  <Phone className="h-5 w-5 flex-shrink-0" />
                  <span className="text-left leading-tight">
                    Бесплатный разбор
                    <span className="block text-[10px] sm:text-xs font-mono uppercase tracking-wider opacity-80 mt-0.5">
                      за 15 минут
                    </span>
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 flex-shrink-0" />
              </button>

              <button
                onClick={handleTrial}
                className="group flex items-center justify-between px-5 sm:px-6 py-4 border-2 border-gold text-paper font-semibold text-sm sm:text-base hover:bg-gold hover:text-ink transition-all duration-300"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 flex-shrink-0 text-gold group-hover:text-ink" />
                  <span className="text-left leading-tight">
                    ИИ-кабинет
                    <span className="block text-[10px] sm:text-xs font-mono uppercase tracking-wider opacity-80 mt-0.5">
                      3 дня бесплатно
                    </span>
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 flex-shrink-0" />
              </button>
            </div>

            {/* Microcopy — objection handlers */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] sm:text-xs text-paper/60 mb-6">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                Без обязательств
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-gold" />
                Конфиденциально
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-gold" />
                Ответ в течение часа
              </span>
            </div>

            {/* Secondary contact channels — chips, not CTAs */}
            <div className="flex flex-wrap gap-2 max-w-xl">
              <button
                onClick={handleTelegram}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-paper/25 text-paper/85 text-xs sm:text-sm font-medium hover:border-gold hover:text-gold transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Telegram
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-paper/25 text-paper/85 text-xs sm:text-sm font-medium hover:border-gold hover:text-gold transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </button>
              <button
                onClick={() => navigate(dashboardHome)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-paper/25 text-paper/85 text-xs sm:text-sm font-medium hover:border-gold hover:text-gold transition-colors"
              >
                <Bot className="h-3.5 w-3.5" />
                1 вопрос ИИ — бесплатно
              </button>
            </div>
          </div>

          {/* Right: portrait as archival photograph */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end order-first lg:order-last">
            <div className="relative w-full max-w-[300px] sm:max-w-[360px] md:max-w-[400px]">
              {/* Gold frame corners */}
              <div className="absolute -top-2 -left-2 w-10 h-10 border-t-2 border-l-2 border-gold z-10" aria-hidden />
              <div className="absolute -top-2 -right-2 w-10 h-10 border-t-2 border-r-2 border-gold z-10" aria-hidden />
              <div className="absolute -bottom-2 -left-2 w-10 h-10 border-b-2 border-l-2 border-gold z-10" aria-hidden />
              <div className="absolute -bottom-2 -right-2 w-10 h-10 border-b-2 border-r-2 border-gold z-10" aria-hidden />

              <div className="relative overflow-hidden bg-paper-deep shadow-strong aspect-[3/4]">
                <BrandedAvatar
                  src={branding.photoUrl}
                  name={branding.displayName}
                  className="absolute inset-0"
                />
                {/* Archival label strip */}
                <div className="absolute bottom-0 inset-x-0 bg-ink/85 backdrop-blur-sm px-4 py-2.5 text-paper">
                  <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase">
                    <span className="truncate pr-2">{initialsShort} · юрист</span>
                    <span className="text-gold flex-shrink-0">{branding.subtitle.split(" ")[0] || "юрист"}</span>
                  </div>
                </div>
              </div>

              {/* "Seal" — bordeaux stamp circle (увеличен и улучшена читаемость) */}
              <div className="absolute -bottom-8 -right-4 sm:-right-8 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-seal/80 bg-paper backdrop-blur-sm flex items-center justify-center rotate-[-8deg] shadow-medium">
                <div className="text-center px-2">
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.2em] text-seal uppercase font-semibold">
                    Из практики
                  </div>
                  <div className="font-serif italic text-seal text-base sm:text-lg mt-1 leading-none font-semibold">
                    500+ дел
                  </div>
                  <div className="font-mono text-[8px] sm:text-[9px] tracking-[0.15em] text-seal/80 uppercase mt-1">
                    в архиве
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
