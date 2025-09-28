import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Send, Mail, MapPin, Clock } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
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

  const handleEmail = () => {
    window.location.href = "mailto:dompc9@gmail.com";
  };

  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="col-span-1 lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <span className="text-xl font-bold text-primary-foreground">ЮП</span>
              </div>
              <div>
                <h3 className="text-xl font-bold">Юридическая помощь призывникам</h3>
                <p className="text-sm text-background/70">Профессиональные консультации</p>
              </div>
            </div>
            <p className="text-background/80 mb-6 max-w-md">
              Оказываем профессиональную юридическую и медицинскую помощь по вопросам 
              военного призыва. Гарантируем конфиденциальность и индивидуальный подход.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={handlePhoneCall}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={handleWhatsApp}>
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={handleTelegram}>
                <Send className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={handleEmail}>
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Навигация</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-background/80 hover:text-background transition-smooth">
                  Главная
                </Link>
              </li>
              <li>
                <Link to="/services" className="text-background/80 hover:text-background transition-smooth">
                  Услуги
                </Link>
              </li>
              <li>
                <Link to="/testimonials" className="text-background/80 hover:text-background transition-smooth">
                  Отзывы
                </Link>
              </li>
              <li>
                <Link to="/templates" className="text-background/80 hover:text-background transition-smooth">
                  Шаблоны документов
                </Link>
              </li>
              <li>
                <Link to="/diagnoses" className="text-background/80 hover:text-background transition-smooth">
                  Диагнозы
                </Link>
              </li>
              <li>
                <Link to="/forum" className="text-background/80 hover:text-background transition-smooth">
                  Форум
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Контакты</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Phone className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-background font-medium">+7 (925) 350-05-33</p>
                  <p className="text-background/70 text-sm">Бесплатные консультации</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-background font-medium">dompc9@gmail.com</p>
                  <p className="text-background/70 text-sm">Письменные консультации</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-background font-medium">Пн-Пт: 9:00-20:00</p>
                  <p className="text-background/70 text-sm">Сб-Вс: по предварительной записи</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-background/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-background/70 text-sm">
              © 2024 Юридическая помощь призывникам. Все права защищены.
            </p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="text-background/70 hover:text-background text-sm transition-smooth">
                Политика конфиденциальности
              </a>
              <a href="#" className="text-background/70 hover:text-background text-sm transition-smooth">
                Условия использования
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;