import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, X, Phone, Send } from "lucide-react";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  const handleTelegram = () => {
    window.open("https://t.me/nepriziv2", "_blank");
  };

  const handlePhone = () => {
    window.location.href = "tel:+79253500533";
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <Card className="mb-4 w-80 shadow-strong border-0 bg-background">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Свяжитесь с нами</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleChat}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Выберите удобный способ связи для получения консультации:
            </p>
            
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleWhatsApp}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp чат
            </Button>
            
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleTelegram}
            >
              <Send className="h-4 w-4 mr-2" />
              Telegram канал
            </Button>
            
            <Button
              variant="default"
              className="w-full justify-start"
              onClick={handlePhone}
            >
              <Phone className="h-4 w-4 mr-2" />
              Позвонить сейчас
            </Button>
            
            <div className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t">
              Работаем ежедневно с 9:00 до 20:00
              <br />
              Экстренные консультации 24/7
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        variant="cta"
        size="lg"
        onClick={toggleChat}
        className="h-14 w-14 rounded-full shadow-strong hover:shadow-medium transition-bounce"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
};

export default ChatWidget;