import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, MessageCircle, Send, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { contactFormSchema } from "@/lib/validations";

const ContactForm = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate input
    const validation = contactFormSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        variant: "destructive",
        title: "Ошибка валидации",
        description: "Проверьте правильность заполнения полей",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit via secure edge function with server-side rate limiting
      const { data, error } = await supabase.functions.invoke('submit-contact', {
        body: {
          name: validation.data.name,
          phone: validation.data.phone,
          email: validation.data.email || "",
          message: validation.data.message,
        }
      });

      if (error) {
        throw new Error(error.message || "Ошибка отправки");
      }

      if (!data?.success) {
        throw new Error(data?.message || "Ошибка при обработке заявки");
      }

      // Send mailto as notification with encoded data
      const subject = encodeURIComponent("Заявка на консультацию с сайта");
      const body = encodeURIComponent(
        `Имя: ${validation.data.name}\nТелефон: ${validation.data.phone}\nEmail: ${validation.data.email || "не указан"}\n\nСообщение:\n${validation.data.message}`
      );
      
      window.location.href = `mailto:dompc9@gmail.com?subject=${subject}&body=${body}`;
      
      toast({
        title: "Заявка отправлена!",
        description: "Мы свяжемся с вами в ближайшее время.",
      });

      setFormData({ name: "", phone: "", email: "", message: "" });
    } catch (error: any) {
      // Handle rate limiting error specifically
      if (error.message?.includes("подождите")) {
        toast({
          variant: "destructive",
          title: "Слишком частые запросы",
          description: error.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Ошибка отправки",
          description: error.message || "Пожалуйста, попробуйте еще раз.",
        });
      }
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
    <section className="py-12 sm:py-16 md:py-20 bg-muted/30" aria-labelledby="contact-heading">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 id="contact-heading" className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
            Свяжитесь с нами
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
            Бесплатная консультация — мы свяжемся в течение 1 часа
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 max-w-6xl mx-auto">
          {/* Contact Form */}
          <Card className="shadow-medium border-0 bg-background">
            <CardHeader>
              <CardTitle className="text-2xl text-foreground">Оставить заявку</CardTitle>
              <CardDescription>
                Заполните форму, и мы свяжемся с вами в течение 1 часа
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6" aria-label="Форма обратной связи">
                <div className="space-y-2">
                  <Label htmlFor="name">Ваше имя *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Введите ваше имя"
                    maxLength={100}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "name-error" : undefined}
                  />
                  {errors.name && <p id="name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>}
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
                    maxLength={18}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                  />
                  {errors.phone && <p id="phone-error" className="text-sm text-destructive" role="alert">{errors.phone}</p>}
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
                    maxLength={255}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {errors.email && <p id="email-error" className="text-sm text-destructive" role="alert">{errors.email}</p>}
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
                    maxLength={2000}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? "message-error" : undefined}
                  />
                  {errors.message && <p id="message-error" className="text-sm text-destructive" role="alert">{errors.message}</p>}
                </div>

                <Button
                  type="submit"
                  variant="cta"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full h-12 text-base font-semibold gap-2"
                  aria-label={isSubmitting ? "Отправка формы" : "Отправить заявку"}
                >
                  <Mail className="h-5 w-5" aria-hidden="true" />
                  {isSubmitting ? "Отправляем..." : "Отправить заявку"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Methods */}
          <aside className="space-y-4 sm:space-y-6" aria-label="Способы связи">
            <Card className="shadow-soft border-0 bg-gradient-primary text-primary-foreground">
              <CardContent className="p-5 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">Свяжитесь напрямую</h3>

                <nav className="space-y-3 sm:space-y-4" aria-label="Контактные способы связи">
                  <Button
                    variant="contact"
                    size="lg"
                    onClick={handlePhoneCall}
                    className="w-full justify-start text-left h-auto py-3 gap-3"
                    aria-label="Позвонить"
                  >
                    <Phone className="h-5 w-5 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-sm sm:text-base">Позвонить</div>
                      <div className="text-xs sm:text-sm opacity-90">+7 (925) 350-05-33</div>
                    </div>
                  </Button>

                  <Button
                    variant="contact"
                    size="lg"
                    onClick={handleWhatsApp}
                    className="w-full justify-start text-left h-auto py-3 gap-3"
                  >
                    <MessageCircle className="h-5 w-5 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-sm sm:text-base">WhatsApp</div>
                      <div className="text-xs sm:text-sm opacity-90">Быстрые ответы</div>
                    </div>
                  </Button>

                  <Button
                    variant="contact"
                    size="lg"
                    onClick={handleTelegram}
                    className="w-full justify-start text-left h-auto py-3 gap-3"
                  >
                    <Send className="h-5 w-5 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-sm sm:text-base">Telegram канал</div>
                      <div className="text-xs sm:text-sm opacity-90">Полезная информация</div>
                    </div>
                  </Button>
                </nav>
              </CardContent>
            </Card>

            <Card className="shadow-soft border-0 bg-background">
              <CardContent className="p-5 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">
                  Время работы
                </h3>
                <dl className="space-y-2 text-muted-foreground">
                  <div>
                    <dt className="inline">Понедельник - Пятница: </dt>
                    <dd className="inline">9:00 - 20:00</dd>
                  </div>
                  <div>
                    <dt className="inline">Суббота: </dt>
                    <dd className="inline">10:00 - 18:00</dd>
                  </div>
                  <div>
                    <dt className="inline">Воскресенье: </dt>
                    <dd className="inline">12:00 - 16:00</dd>
                  </div>
                </dl>
                <aside className="mt-6 p-4 bg-accent/10 rounded-lg" aria-label="Информация об экстренной консультации">
                  <p className="text-sm text-foreground">
                    <strong>Экстренная консультация:</strong> доступна 24/7 через WhatsApp
                  </p>
                </aside>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;