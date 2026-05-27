import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LawyerUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Если уже Pro — диалог показывает плашку «у вас активен Pro» вместо CTA */
  currentTier?: "basic" | "pro";
}

const TIERS = [
  {
    key: "basic",
    title: "Basic",
    price: "Бесплатно",
    description: "Старт без вложений — для первых клиентов",
    features: [
      "До 5 клиентов в CRM",
      "Чаты с клиентами",
      "Базовые шаблоны документов",
      "Канбан и список дел",
      "Аналитика по воронке",
    ],
    cta: null as null | string,
    highlight: false,
  },
  {
    key: "pro",
    title: "Pro",
    price: "1 990 ₽/мес",
    yearPrice: "19 900 ₽/год (экономия 17%)",
    description: "Полная сила ИИ и неограниченный объём дел",
    features: [
      "Неограниченное число клиентов",
      "ИИ-анализ дела целиком (категория, риски, план)",
      "ИИ-подсказки ответов в чате с клиентом",
      "Pro-шаблоны (жалобы в суд, иски, надзорные обращения)",
      "Брендированная страница /u/<вы> с QR",
      "Приоритетная поддержка",
    ],
    cta: "Оформить Pro",
    highlight: true,
  },
] as const;

const LawyerUpgradeDialog = ({ open, onOpenChange, currentTier = "basic" }: LawyerUpgradeDialogProps) => {
  const [cycle, setCycle] = useState<"month" | "year">("month");

  // Контакт-флоу: подписка оформляется через менеджера (нет онлайн-Stripe для юристов).
  // Открываем заранее заполненное обращение в Telegram / письмо.
  const startUpgrade = () => {
    const subject = encodeURIComponent("Оформление тарифа Lawyer Pro");
    const body = encodeURIComponent(
      `Здравствуйте! Хочу оформить тариф Lawyer Pro на сайте nepriziv.ru.\nЦикл оплаты: ${cycle === "month" ? "помесячно" : "годовой"}.`,
    );
    window.location.href = `mailto:hello@nepriziv.ru?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Тарифы юриста
          </DialogTitle>
          <DialogDescription>
            Сравните возможности Basic и Pro — все ИИ-функции включены в Pro.
          </DialogDescription>
        </DialogHeader>

        {/* Переключатель цикла оплаты */}
        <div className="flex justify-center mb-2">
          <div className="inline-flex rounded-lg border p-1 bg-muted/40">
            <button
              onClick={() => setCycle("month")}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                cycle === "month" ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              Помесячно
            </button>
            <button
              onClick={() => setCycle("year")}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                cycle === "year" ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              За год · −17%
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          {TIERS.map((tier) => {
            const isCurrent = currentTier === tier.key;
            return (
              <div
                key={tier.key}
                className={cn(
                  "rounded-xl border p-5 flex flex-col relative",
                  tier.highlight
                    ? "border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/60 dark:from-amber-950/30 dark:to-amber-950/10"
                    : "border-border bg-card",
                )}
              >
                {tier.highlight && (
                  <Badge className="absolute -top-2.5 right-4 bg-amber-500 text-white border-0">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Рекомендуем
                  </Badge>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-lg">{tier.title}</h3>
                  {isCurrent && (
                    <Badge variant="outline" className="text-[10px]">Активен</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold mt-2">
                  {tier.key === "pro" && cycle === "year" ? tier.yearPrice : tier.price}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>

                <ul className="text-sm space-y-2 mt-4 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4 flex-shrink-0 mt-0.5",
                          tier.highlight ? "text-amber-600" : "text-emerald-500",
                        )}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {tier.cta && !isCurrent && (
                  <Button
                    className={cn(
                      "mt-5 w-full",
                      tier.highlight && "bg-amber-500 hover:bg-amber-600 text-white",
                    )}
                    onClick={startUpgrade}
                  >
                    {tier.cta}
                  </Button>
                )}
                {isCurrent && (
                  <Button variant="outline" className="mt-5 w-full" disabled>
                    Текущий тариф
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Оплата по счёту / на расчётный счёт. Чек НДФЛ и закрывающие документы — по запросу.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default LawyerUpgradeDialog;
