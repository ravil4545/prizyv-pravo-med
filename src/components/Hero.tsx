import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MessageCircle, Send, Bot, ChevronDown, Sparkles, ArrowRight } from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";

const Hero = () => {
  const [aiOpen, setAiOpen] = useState(false);
  const navigate = useNavigate();
  const branding = useBranding();

  // Разбиваем ФИО на «фамилию» и «имя+отчество» для editorial-вёрстки
  const nameParts = branding.displayName.trim().split(/\s+/);
  const surname = nameParts[0] || "";
  const givenNames = nameParts.slice(1).join(" ") || branding.displayName;
  const initialsShort = nameParts.length >= 2
    ? `${nameParts[1][0]}. ${nameParts[0]}`
    : branding.displayName;

  const phoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");
  const dashboardHome = `${branding.routePrefix}/dashboard`;

  const handlePhoneCall = () => {
    window.location.href = `tel:+${phoneDigits}`;
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(
      `Здравствуйте, ${givenNames}! Мне нужна консультация по призыву...`
    );
    const wa = branding.whatsapp || "79253500533";
    window.open(`https://wa.me/${wa}?text=${msg}`, "_blank");
  };

  const handleTelegram = () => {
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
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
            {/* Section number */}
            <div className="flex items-center gap-3 mb-6">
              <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 01</span>
              <span className="h-px flex-1 bg-gold/30 max-w-[80px]" />
              <span className="font-mono text-gold/70 text-xs tracking-[0.25em] uppercase">
                Ваш юрист
              </span>
            </div>

            {/* Editorial headline */}
            <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95] mb-4 sm:mb-6">
              <span className="block italic font-normal text-gold text-2xl sm:text-3xl md:text-4xl mb-2 tracking-normal">
                {surname}
              </span>
              <span className="block">{nameParts[1] || ""}</span>
              <span className="block font-light italic text-paper/70 text-3xl sm:text-4xl md:text-5xl mt-2">
                — {branding.subtitle.toLowerCase()}
              </span>
            </h1>

            {/* Quote-anchor */}
            <blockquote className="relative my-8 sm:my-10 pl-5 sm:pl-6 max-w-xl border-l-2 border-gold/60">
              <p className="font-serif italic text-base sm:text-lg md:text-xl text-paper/85 leading-relaxed">
                «Призывная комиссия — это не приговор. Это процедура,
                в которой у вас в десять раз больше прав, чем вам пытаются показать.»
              </p>
              <footer className="mt-3 font-mono text-[10px] sm:text-xs tracking-[0.2em] uppercase text-gold/70">
                — {initialsShort}
              </footer>
            </blockquote>

            {/* Primary CTAs — minimal, sharp */}
            <div className="flex flex-col gap-3 max-w-md mb-8">
              <button
                onClick={handlePhoneCall}
                className="group flex items-center justify-between px-6 py-4 bg-gold text-ink font-semibold text-base hover:bg-gold-deep hover:text-paper transition-all duration-300"
              >
                <span className="flex items-center gap-3">
                  <Phone className="h-5 w-5" />
                  Записаться на консультацию
                </span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleTelegram}
                  className="flex items-center justify-center gap-2 px-4 py-3 border border-paper/30 text-paper text-sm font-medium hover:border-gold hover:text-gold transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Telegram
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-2 px-4 py-3 border border-paper/30 text-paper text-sm font-medium hover:border-gold hover:text-gold transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
              </div>
            </div>

            {/* Secondary AI option — understated */}
            <div className="border-t border-paper/15 pt-6 max-w-md">
              <button
                onClick={() => setAiOpen(!aiOpen)}
                className="group flex items-center gap-3 text-sm text-paper/70 hover:text-gold transition-colors"
                aria-expanded={aiOpen}
              >
                <Sparkles className="h-4 w-4 text-gold" />
                <span className="font-mono tracking-wider uppercase text-xs">
                  Или начните с ИИ-помощника — 1 вопрос бесплатно
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${aiOpen ? "rotate-180" : ""}`}
                />
              </button>

              {aiOpen && (
                <div className="mt-4 p-5 border border-paper/15 bg-paper/5 backdrop-blur-sm">
                  <p className="text-xs text-paper/75 mb-4 leading-relaxed">
                    Инструмент предварительной оценки под надзором юриста.
                    Не заменяет очной консультации, но помогает разобраться в документах
                    и оценить шансы.
                  </p>
                  <button
                    onClick={() => navigate(dashboardHome)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-paper/10 hover:bg-gold hover:text-ink text-paper text-sm font-medium transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Открыть ИИ-кабинет
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
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

              <div className="relative overflow-hidden bg-paper-deep shadow-strong">
                <img
                  src={branding.photoUrl}
                  alt={`Юрист ${branding.displayName}`}
                  className="w-full aspect-[3/4] object-cover object-top"
                  width={768}
                  height={1024}
                  loading="eager"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/lawyer-portrait.svg";
                  }}
                />
                {/* Archival label strip */}
                <div className="absolute bottom-0 inset-x-0 bg-ink/85 backdrop-blur-sm px-4 py-2.5 text-paper">
                  <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase">
                    <span className="truncate pr-2">{initialsShort} · юрист</span>
                    <span className="text-gold flex-shrink-0">{branding.subtitle.split(" ")[0] || "юрист"}</span>
                  </div>
                </div>
              </div>

              {/* "Seal" — bordeaux stamp circle */}
              <div className="absolute -bottom-7 -right-4 sm:-right-7 w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-seal/80 bg-paper backdrop-blur-sm flex items-center justify-center rotate-[-8deg] shadow-medium">
                <div className="text-center">
                  <div className="font-mono text-[8px] sm:text-[9px] tracking-[0.2em] text-seal uppercase">
                    Подтверждено
                  </div>
                  <div className="font-serif italic text-seal text-xs sm:text-sm mt-0.5">
                    500+ дел
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip — trust trio */}
        <div className="mt-12 sm:mt-16 pt-6 border-t border-paper/15 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
          {[
            { num: "10+", label: "лет защиты призывников" },
            { num: "500+", label: "дел доведено до результата" },
            { num: "88", label: "статей Расписания болезней" },
          ].map((t, i) => (
            <div key={t.label} className="flex items-baseline gap-4">
              <span className="font-mono text-gold/60 text-xs">0{i + 1}</span>
              <div>
                <div className="font-serif text-3xl sm:text-4xl text-gold leading-none">
                  {t.num}
                </div>
                <div className="text-xs sm:text-sm text-paper/70 mt-1 leading-snug">
                  {t.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
