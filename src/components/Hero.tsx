import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, CheckCircle, Bot, ChevronDown, FileSearch, Brain, MessageSquarePlus } from "lucide-react";
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
    <section className="relative bg-gradient-hero text-primary-foreground" aria-label="Главная информация о наших услугах">
      <div className="absolute inset-0 bg-black/20" aria-hidden="true"></div>
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: `url(${heroImage})` }}
        role="img"
        aria-label="Фоновое изображение юридической помощи"
      ></div>
      
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
            Юридическая и медицинская помощь
            <span className="block text-accent-light">призывникам</span>
          </h1>
          
          <p className="text-xl md:text-2xl mb-8 text-primary-foreground/90 max-w-3xl mx-auto leading-relaxed">
            Получите профессиональную поддержку в вопросах призыва. Анализ медицинских документов, 
            правовое сопровождение и консультации по законному получению военного билета.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4" role="group" aria-label="Кнопки связи с нами">
            <Button 
              variant="hero" 
              size="lg"
              onClick={handlePhoneCall}
              className="w-full sm:w-auto text-lg px-8 py-4"
              aria-label="Позвонить для бесплатной консультации"
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
              Бесплатная консультация
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={handleWhatsApp}
              className="w-full sm:w-auto text-lg px-8 py-4 bg-white/10 border-white/30 text-white hover:bg-white/20"
              aria-label="Написать в WhatsApp для консультации"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Написать в WhatsApp
            </Button>
          </div>

          {/* AI Help Button with expandable panel */}
          <div className="flex flex-col items-center mb-12">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setAiOpen(!aiOpen)}
              className="w-full sm:w-auto text-lg px-8 py-4 bg-accent/20 border-accent-light/50 text-white hover:bg-accent/30 transition-all"
              aria-expanded={aiOpen}
            >
              <Bot className="h-5 w-5" aria-hidden="true" />
              ИИ помощь бесплатно
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform duration-300 ${aiOpen ? "rotate-180" : ""}`} />
            </Button>

            {aiOpen && (
              <div className="mt-4 max-w-3xl w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 text-left animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <Brain className="h-5 w-5 text-accent-light flex-shrink-0 mt-0.5" />
                    <p className="text-sm md:text-base text-primary-foreground/90">
                      <strong className="text-white">Анализ 88 статей Расписания болезней</strong> (Постановление №565). ИИ оценивает вероятность получения категории «В» на основе загруженных медицинских документов, выстраивает рекомендации и помогает выявить недостающие обследования.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <FileSearch className="h-5 w-5 text-accent-light flex-shrink-0 mt-0.5" />
                    <p className="text-sm md:text-base text-primary-foreground/90">
                      <strong className="text-white">Загрузите медицинские документы</strong> (PDF, фото, DOCX) — ИИ извлечёт текст, определит тип документа, привяжет к соответствующим статьям Расписания болезней и даст рекомендации по дальнейшим действиям.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <MessageSquarePlus className="h-5 w-5 text-accent-light flex-shrink-0 mt-0.5" />
                    <p className="text-sm md:text-base text-primary-foreground/90">
                      <strong className="text-white">Интеллектуальный чат-бот</strong>, который учитывает ваши медицинские документы и диагнозы. Задавайте вопросы о правах призывника, процедуре обжалования, необходимых обследованиях — получайте персонализированные ответы.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate("/dashboard")}
                  className="mt-5 w-full sm:w-auto bg-accent hover:bg-accent/90 text-white"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Попробовать бесплатно
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-center md:justify-start space-x-3 text-primary-foreground/90">
              <CheckCircle className="h-6 w-6 text-accent-light flex-shrink-0" />
              <span className="text-sm md:text-base">Опыт работы 10+ лет</span>
            </div>
            <div className="flex items-center justify-center md:justify-start space-x-3 text-primary-foreground/90">
              <CheckCircle className="h-6 w-6 text-accent-light flex-shrink-0" />
              <span className="text-sm md:text-base">Более 500 успешных случаев</span>
            </div>
            <div className="flex items-center justify-center md:justify-start space-x-3 text-primary-foreground/90">
              <CheckCircle className="h-6 w-6 text-accent-light flex-shrink-0" />
              <span className="text-sm md:text-base">Конфиденциальность гарантирована</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;