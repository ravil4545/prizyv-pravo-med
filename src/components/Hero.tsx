import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, CheckCircle } from "lucide-react";
import heroImage from "@/assets/hero-legal.jpg";

const Hero = () => {
  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  return (
    <section className="relative bg-gradient-hero text-primary-foreground">
      <div className="absolute inset-0 bg-black/20"></div>
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: `url(${heroImage})` }}
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

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button 
              variant="hero" 
              size="lg"
              onClick={handlePhoneCall}
              className="w-full sm:w-auto text-lg px-8 py-4"
            >
              <Phone className="h-5 w-5" />
              Бесплатная консультация
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={handleWhatsApp}
              className="w-full sm:w-auto text-lg px-8 py-4 bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <MessageCircle className="h-5 w-5" />
              Написать в WhatsApp
            </Button>
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