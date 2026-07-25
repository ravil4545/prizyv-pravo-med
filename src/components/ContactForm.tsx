import { useState } from "react";
import { Link } from "react-router-dom";
import { sectionNumber } from "@/lib/sectionNumbers";
import {
  Phone,
  MessageCircle,
  Send,
  ArrowRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  contactFormSchema,
  type ConscriptAge,
  type ConscriptStage,
} from "@/lib/validations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranding } from "@/contexts/BrandingContext";
import { trackEvent } from "@/lib/analytics";

interface FormData {
  name: string;
  phone: string;
  email: string;
  age: ConscriptAge | "";
  stage: ConscriptStage | "";
  message: string;
  consent: boolean;
}

const AGE_LABELS: Record<ConscriptAge, string> = {
  "17": "17 лет",
  "18": "18 лет",
  "19": "19 лет",
  "20": "20 лет",
  "21": "21 год",
  "22-25": "22–25 лет",
  "26-27": "26–27 лет",
  "27+": "Старше 27 лет",
};

const STAGE_LABELS: Record<ConscriptStage, string> = {
  povestka: "Повестка пришла",
  medcommission: "Готовлюсь к медкомиссии",
  decision: "Не согласен с решением комиссии",
  court: "Прохожу обжалование в суде",
  ai_only: "Хочу попробовать ИИ-кабинет",
  other: "Другое",
};

const ContactForm = () => {
  const { toast } = useToast();
  const branding = useBranding();
  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    age: "",
    stage: "",
    message: "",
    consent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const phoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");
  const phoneDisplay = branding.phone || "+7 (925) 350-05-33";

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  };

  const handlePhoneCall = () => {
    window.location.href = `tel:+${phoneDigits}`;
  };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent("Добрый день! Мне нужна консультация по призыву...");
    const wa = branding.whatsapp || "79253500533";
    window.open(`https://wa.me/${wa}?text=${msg}`, "_blank");
  };
  const handleTelegram = () => {
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

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
        title: "Заполните обязательные поля",
        description: "Проверьте правильность заполнения формы",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: {
          name: validation.data.name,
          phone: validation.data.phone,
          email: validation.data.email || "",
          message: validation.data.message,
          age: validation.data.age,
          stage: validation.data.stage,
          source: "contact_form",
        },
      });

      if (error) {
        throw new Error(error.message || "Ошибка отправки");
      }

      if (!data?.success) {
        throw new Error(data?.message || "Ошибка при обработке заявки");
      }

      trackEvent("contact_form_submit", { ref: validation.data.stage });
      setSubmitted(true);
      setFormData({
        name: "",
        phone: "",
        email: "",
        age: "",
        stage: "",
        message: "",
        consent: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Попробуйте ещё раз";
      if (message.includes("подождите")) {
        toast({
          variant: "destructive",
          title: "Слишком частые запросы",
          description: message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Ошибка отправки",
          description: message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="contact"
      className="relative bg-paper text-ink py-20 sm:py-28"
      aria-labelledby="contact-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("contact")}</span>
          <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
          <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
            Связь
          </span>
        </div>

        <h2
          id="contact-heading"
          className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] max-w-3xl mb-6"
        >
          Опишите вашу ситуацию
          <span className="block italic text-gold font-light">— разбор за 15 минут, бесплатно.</span>
        </h2>

        <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-12 sm:mb-16">
          Отвечаем в течение часа в рабочее время. На срочные обращения — реагируем
          круглосуточно через Telegram и WhatsApp.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Form */}
          <div className="lg:col-span-7">
            {submitted ? (
              <div className="border border-gold bg-gold/5 p-6 sm:p-10">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center bg-gold text-ink flex-shrink-0">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-serif text-2xl sm:text-3xl text-ink leading-tight">
                      Заявка принята.
                    </h3>
                    <p className="text-sm text-ink-soft mt-2 leading-relaxed">
                      Свяжемся в течение часа в рабочее время. А пока — самые быстрые способы:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={handlePhoneCall}
                    className="group flex items-center justify-between gap-2 px-4 py-3.5 bg-ink text-paper text-sm font-semibold hover:bg-gold hover:text-ink transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Позвонить
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  <button
                    onClick={handleWhatsApp}
                    className="group flex items-center justify-between gap-2 px-4 py-3.5 border-2 border-ink text-ink text-sm font-semibold hover:bg-gold hover:border-gold transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  <button
                    onClick={handleTelegram}
                    className="group flex items-center justify-between gap-2 px-4 py-3.5 border-2 border-ink text-ink text-sm font-semibold hover:bg-gold hover:border-gold transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Telegram
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-6 font-mono text-[11px] tracking-[0.2em] uppercase text-ink/55 hover:text-gold transition-colors"
                >
                  Отправить ещё одну заявку →
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="border border-ink/15 bg-paper p-6 sm:p-9 space-y-5"
                aria-label="Форма обратной связи"
                noValidate
              >
                <div>
                  <label htmlFor="name" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                    Имя <span className="text-seal">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Иван"
                    maxLength={100}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.name}
                    className="w-full bg-paper border border-ink/20 px-4 py-3 text-ink placeholder:text-ink/35 focus:outline-none focus:border-gold transition-colors"
                  />
                  {errors.name && <p className="text-xs text-seal mt-1.5" role="alert">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="phone" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                      Телефон <span className="text-seal">*</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+7 (999) 123-45-67"
                      maxLength={18}
                      required
                      aria-required="true"
                      aria-invalid={!!errors.phone}
                      className="w-full bg-paper border border-ink/20 px-4 py-3 text-ink placeholder:text-ink/35 focus:outline-none focus:border-gold transition-colors"
                    />
                    {errors.phone && <p className="text-xs text-seal mt-1.5" role="alert">{errors.phone}</p>}
                  </div>

                  <div>
                    <label htmlFor="email" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                      Email <span className="text-ink/35">(необязательно)</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="your@email.com"
                      maxLength={255}
                      aria-invalid={!!errors.email}
                      className="w-full bg-paper border border-ink/20 px-4 py-3 text-ink placeholder:text-ink/35 focus:outline-none focus:border-gold transition-colors"
                    />
                    {errors.email && <p className="text-xs text-seal mt-1.5" role="alert">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="age" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                      Возраст призывника <span className="text-seal">*</span>
                    </label>
                    <Select
                      value={formData.age}
                      onValueChange={(v) => updateField("age", v as ConscriptAge)}
                    >
                      <SelectTrigger
                        id="age"
                        aria-invalid={!!errors.age}
                        className="w-full bg-paper border border-ink/20 rounded-none px-4 py-3 h-auto text-ink focus:border-gold"
                      >
                        <SelectValue placeholder="Выберите возраст" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AGE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.age && <p className="text-xs text-seal mt-1.5" role="alert">{errors.age}</p>}
                  </div>

                  <div>
                    <label htmlFor="stage" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                      Стадия процесса <span className="text-seal">*</span>
                    </label>
                    <Select
                      value={formData.stage}
                      onValueChange={(v) => updateField("stage", v as ConscriptStage)}
                    >
                      <SelectTrigger
                        id="stage"
                        aria-invalid={!!errors.stage}
                        className="w-full bg-paper border border-ink/20 rounded-none px-4 py-3 h-auto text-ink focus:border-gold"
                      >
                        <SelectValue placeholder="Выберите вариант" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STAGE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.stage && <p className="text-xs text-seal mt-1.5" role="alert">{errors.stage}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="message" className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/70 block mb-2">
                    Опишите ситуацию <span className="text-seal">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={(e) => updateField("message", e.target.value)}
                    placeholder="Какие документы есть, что говорит военкомат, какая помощь нужна сейчас..."
                    rows={5}
                    maxLength={2000}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.message}
                    className="w-full bg-paper border border-ink/20 px-4 py-3 text-ink placeholder:text-ink/35 focus:outline-none focus:border-gold transition-colors resize-y"
                  />
                  {errors.message && <p className="text-xs text-seal mt-1.5" role="alert">{errors.message}</p>}
                </div>

                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="consent"
                    checked={formData.consent}
                    onCheckedChange={(c) => updateField("consent", c === true)}
                    aria-invalid={!!errors.consent}
                    className="mt-0.5 border-ink/40 data-[state=checked]:bg-gold data-[state=checked]:border-gold data-[state=checked]:text-ink"
                  />
                  <label htmlFor="consent" className="text-xs text-ink-soft leading-relaxed">
                    Согласен на обработку персональных данных по{" "}
                    <Link to="/privacy" className="text-gold hover:underline">
                      политике конфиденциальности
                    </Link>
                    . Данные не передаются третьим лицам.
                  </label>
                </div>
                {errors.consent && <p className="text-xs text-seal" role="alert">{errors.consent}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group inline-flex items-center justify-between gap-3 w-full px-6 py-4 bg-ink text-paper font-semibold text-sm hover:bg-gold hover:text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? "Отправляем..." : "Отправить заявку"}
                  </span>
                  {!isSubmitting && (
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  )}
                </button>

                <p className="text-[11px] text-ink/55 leading-relaxed">
                  Ваши данные защищены договором о конфиденциальности и не передаются третьим лицам.
                </p>
              </form>
            )}
          </div>

          {/* Sidebar: direct contacts */}
          <aside className="lg:col-span-5" aria-label="Способы связи">
            <div className="bg-ink text-paper p-6 sm:p-9">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-5">
                — Связаться напрямую
              </p>

              <h3 className="font-serif text-2xl sm:text-3xl leading-tight mb-6">
                Если ситуация срочная — звоните или пишите в мессенджер.
              </h3>

              <div className="space-y-3">
                <button
                  onClick={handlePhoneCall}
                  className="group flex items-center justify-between w-full gap-3 px-4 py-3.5 bg-gold text-ink font-semibold hover:bg-paper transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Phone className="h-4 w-4" />
                    <span className="text-left">
                      <span className="block text-xs font-mono uppercase tracking-wider opacity-80">
                        Телефон
                      </span>
                      <span className="block font-serif text-base">{phoneDisplay}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  onClick={handleWhatsApp}
                  className="group flex items-center justify-between w-full gap-3 px-4 py-3.5 border border-paper/30 text-paper hover:border-gold hover:text-gold transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-left">
                      <span className="block text-xs font-mono uppercase tracking-wider opacity-80">
                        WhatsApp
                      </span>
                      <span className="block text-sm">Быстрый ответ — 24/7</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  onClick={handleTelegram}
                  className="group flex items-center justify-between w-full gap-3 px-4 py-3.5 border border-paper/30 text-paper hover:border-gold hover:text-gold transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Send className="h-4 w-4" />
                    <span className="text-left">
                      <span className="block text-xs font-mono uppercase tracking-wider opacity-80">
                        Telegram
                      </span>
                      <span className="block text-sm">Канал и личка</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>

            <div className="bg-paper-deep border border-ink/15 p-6 sm:p-7 mt-5">
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-4">
                — Гарантии
              </p>
              <ul className="space-y-3 text-sm text-ink-soft leading-relaxed">
                <li className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                  Ответ в течение часа в рабочее время (Пн–Пт 9–20 МСК).
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                  Бесплатный разбор без обязательств — оплата только за работу по договору.
                </li>
                <li className="flex items-start gap-3">
                  <Lock className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                  Конфиденциальность по договору. Данные не передаются третьим лицам.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default ContactForm;
