import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, MessageCircle, Send, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ContactForm = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Save to database
      const { error } = await supabase
        .from("contact_submissions")
        .insert({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          message: formData.message,
        });

      if (error) throw error;

      // Also send mailto as notification
      const subject = encodeURIComponent("Заявка на консультацию с сайта");
      const body = encodeURIComponent(
        `Имя: ${formData.name}\nТелефон: ${formData.phone}\nEmail: ${formData.email}\n\nСообщение:\n${formData.message}`
      );
      
      window.location.href = `mailto:dompc9@gmail.com?subject=${subject}&body=${body}`;
      
      toast({
        title: "Заявка отправлена!",
        description: "Мы свяжемся с вами в ближайшее время.",
      });

      setFormData({ name: "", phone: "", email: "", message: "" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка отправки",
        description: error.message || "Пожалуйста, попробуйте еще раз.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Свяжитесь с нами
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Получите бесплатную консультацию по вашему вопросу
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Contact Form */}
          <Card className="shadow-medium border-0 bg-background">
            <CardHeader>
              <CardTitle className="text-2xl text-foreground">Оставить заявку</CardTitle>
              <CardDescription>
                Заполните форму, и мы свяжемся с вами в течение 1 часа
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Ваше имя *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Введите ваше имя"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+7 (999) 123-45-67"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Опишите вашу ситуацию *</Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Расскажите подробно о вашей ситуации..."
                    rows={5}
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  variant="cta" 
                  size="lg" 
                  disabled={isSubmitting}
                  className="w-full"
                >
                  <Mail className="h-5 w-5" />
                  {isSubmitting ? "Отправляем..." : "Отправить заявку"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Methods */}
          <div className="space-y-8">
            <Card className="shadow-soft border-0 bg-gradient-primary text-primary-foreground">
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold mb-6">Свяжитесь с нами напрямую</h3>
                
                <div className="space-y-6">
                  <Button 
                    variant="contact"
                    size="lg"
                    onClick={handlePhoneCall}
                    className="w-full justify-start text-left"
                  >
                    <Phone className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Позвонить сейчас</div>
                      <div className="text-sm opacity-90">+7 (925) 350-05-33</div>
                    </div>
                  </Button>

                  <Button 
                    variant="contact"
                    size="lg"
                    onClick={handleWhatsApp}
                    className="w-full justify-start text-left"
                  >
                    <MessageCircle className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">WhatsApp</div>
                      <div className="text-sm opacity-90">Быстрые ответы в чате</div>
                    </div>
                  </Button>

                  <Button 
                    variant="contact"
                    size="lg"
                    onClick={handleTelegram}
                    className="w-full justify-start text-left"
                  >
                    <Send className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Telegram канал</div>
                      <div className="text-sm opacity-90">Полезная информация</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft border-0 bg-background">
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  Время работы
                </h3>
                <div className="space-y-2 text-muted-foreground">
                  <p>Понедельник - Пятница: 9:00 - 20:00</p>
                  <p>Суббота: 10:00 - 18:00</p>
                  <p>Воскресенье: 12:00 - 16:00</p>
                </div>
                <div className="mt-6 p-4 bg-accent/10 rounded-lg">
                  <p className="text-sm text-foreground">
                    <strong>Экстренная консультация:</strong> доступна 24/7 через WhatsApp
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;