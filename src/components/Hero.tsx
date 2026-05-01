import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, CheckCircle2, Bot, ChevronDown, FileSearch, Brain, MessageSquarePlus, Sparkles, Shield } from "lucide-react";
import heroImage from "@/assets/hero-legal-clean.jpg";

const Hero = () => {
  const [aiOpen, setAiOpen] = useState(false);
  const navigate = useNavigate();

  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  return (
    <section className="relative bg-gradient-hero text-primary-foreground overflow-hidden" aria-label="Главная информация">
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25"
        style={{ backgroundImage: `url(${heroImage})` }}
        aria-hidden
      />
      {/* Decorative gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-5 sm:mb-6">
            <Shield className="h-3.5 w-3.5 text-accent-light" />
            <span className="text-xs sm:text-sm font-medium">Опыт 10+ лет · 500+ успешных дел</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 tracking-tight leading-[1.1]">
            Юридическая и медицинская помощь
            <span className="block text-accent-light mt-1 sm:mt-2">призывникам</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl mb-7 sm:mb-9 text-primary-foreground/90 max-w-2xl mx-auto leading-relaxed px-2">
            ИИ анализ документов, правовое сопровождение и консультации по законному получению военного билета.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center mb-3 max-w-lg mx-auto" role="group">
            <Button
              variant="hero"
              size="lg"
              onClick={handlePhoneCall}
              className="w-full sm:w-auto text-base px-6 py-6 sm:py-4 sm:text-lg font-semibold gap-2 shadow-lg"
            >
              <Phone className="h-5 w-5" />
              Бесплатная консультация
            </Button>
            <Button
              size="lg"
              onClick={handleWhatsApp}
              className="w-full sm:w-auto text-base px-6 py-6 sm:py-4 sm:text-lg font-semibold bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg"
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </Button>
          </div>

          {/* AI button */}
          <div className="flex flex-col items-center mb-10 sm:mb-12 mt-4">
            <button
              onClick={() => setAiOpen(!aiOpen)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/30 hover:bg-white/15 transition-all text-sm sm:text-base font-medium"
              aria-expanded={aiOpen}
            >
              <Sparkles className="h-4 w-4 text-accent-light" />
              <span>ИИ помощь — бесплатно</span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${aiOpen ? "rotate-180" : ""}`} />
            </button>

            {aiOpen && (
              <div className="mt-4 max-w-3xl w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 sm:p-6 text-left animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-4">
                  {[
                    { icon: Brain, title: "Анализ 88 статей Расписания болезней", desc: "Постановление №565. ИИ оценивает вероятность категории «В» по вашим документам." },
                    { icon: FileSearch, title: "Загрузка документов", desc: "PDF, фото, DOCX — ИИ извлечёт текст, привяжет к статьям, даст рекомендации." },
                    { icon: MessageSquarePlus, title: "Чат-бот с контекстом", desc: "Учитывает ваши документы и диагнозы. Персонализированные ответы." },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-accent/20">
                        <Icon className="h-4 w-4 text-accent-light" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm sm:text-base">{title}</p>
                        <p className="text-xs sm:text-sm text-primary-foreground/85 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => navigate("/dashboard")}
                  className="mt-5 w-full bg-accent hover:bg-accent/90 text-white font-semibold gap-2 h-11"
                >
                  <Bot className="h-4 w-4" />
                  Попробовать бесплатно
                </Button>
              </div>
            )}
          </div>

          {/* Trust indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {[
              "Опыт работы 10+ лет",
              "Более 500 успешных случаев",
              "Конфиденциальность гарантирована",
            ].map((text) => (
              <div key={text} className="flex items-center justify-center sm:justify-start gap-2.5 text-primary-foreground/90 px-3 py-2 sm:px-0 sm:py-0 rounded-xl bg-white/5 sm:bg-transparent">
                <CheckCircle2 className="h-5 w-5 text-accent-light flex-shrink-0" />
                <span className="text-sm sm:text-base font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
