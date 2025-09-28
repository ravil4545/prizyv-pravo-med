import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Send } from "lucide-react";
import { Link } from "react-router-dom";

const Header = () => {
  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  const handleTelegram = () => {
    window.open("https://t.me/nepriziv2", "_blank");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
              <span className="text-lg font-bold text-primary-foreground">ЮП</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">Юридическая помощь</h1>
              <p className="text-xs text-muted-foreground">призывникам</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-sm font-medium text-foreground hover:text-primary transition-smooth">
              Главная
            </Link>
            <Link to="/services" className="text-sm font-medium text-foreground hover:text-primary transition-smooth">
              Услуги
            </Link>
            <Link to="/testimonials" className="text-sm font-medium text-foreground hover:text-primary transition-smooth">
              Отзывы
            </Link>
            <Link to="/templates" className="text-sm font-medium text-foreground hover:text-primary transition-smooth">
              Шаблоны
            </Link>
          </nav>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePhoneCall}
              className="hidden sm:flex"
            >
              <Phone className="h-4 w-4" />
              <span className="hidden lg:inline">Позвонить</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWhatsApp}
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden lg:inline">WhatsApp</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTelegram}
            >
              <Send className="h-4 w-4" />
              <span className="hidden lg:inline">Telegram</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;