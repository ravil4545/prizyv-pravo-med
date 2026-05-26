import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, UserPlus, Sparkles, FileText, MessageSquare, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const YOOMONEY_PAYMENT_URL = "https://yoomoney.ru/bill/pay/1FUPNGI39FP.260215";

interface LimitReachedDialogProps {
  open: boolean;
  onClose: () => void;
  type: "ai" | "document";
  isDemoMode?: boolean;
}

export default function LimitReachedDialog({ open, onClose, type, isDemoMode = false }: LimitReachedDialogProps) {
  const navigate = useNavigate();

  const handlePayment = async () => {
    window.open(YOOMONEY_PAYMENT_URL, "_blank");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("notify-payment-click", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
    } catch {}
    onClose();
  };

  const handleRegister = () => {
    navigate("/auth");
    onClose();
  };

  const Icon = type === "ai" ? MessageSquare : FileText;
  const label = type === "ai" ? "вопросов к ИИ" : "загрузок документов";
  const labelOne = type === "ai" ? "вопрос к ИИ" : "загрузку документа";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-serif text-xl">
            <div className="p-2 border border-gold bg-gold/10">
              <Icon className="h-5 w-5 text-gold-deep" />
            </div>
            Лимит исчерпан
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isDemoMode ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft leading-relaxed">
                Вы использовали бесплатный пробный {labelOne}.
                Зарегистрируйтесь бесплатно — получите ещё <span className="font-semibold text-ink">3 {label}</span>.
                Подписка снимает все лимиты.
              </p>

              <div className="bg-paper-deep/50 border border-ink/10 p-4 space-y-2">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
                  Тарифный план
                </p>
                {[
                  { tier: "Аноним", value: "1 + 1" },
                  { tier: "Регистрация (бесплатно)", value: "3 + 3" },
                  { tier: "Подписка от 9 000 ₽/мес", value: "Безлимит" },
                ].map((t) => (
                  <div key={t.tier} className="flex items-center justify-between text-sm">
                    <span className="text-ink-soft">{t.tier}</span>
                    <span className="font-mono text-ink font-medium">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft leading-relaxed">
                Вы использовали все бесплатные {label} после регистрации.
                Подписка снимает лимиты и открывает дополнительные возможности.
              </p>

              <div className="bg-paper-deep/50 border border-ink/10 p-4 space-y-2">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
                  Что даёт подписка
                </p>
                {[
                  "Безлимитные загрузки документов",
                  "Безлимитные вопросы к ИИ",
                  "Прямой чат с юристом",
                  "Генерация документов и шаблонов",
                ].map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                    <Sparkles className="h-3.5 w-3.5 text-gold flex-shrink-0 mt-0.5" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {isDemoMode ? (
              <>
                <Button
                  onClick={handleRegister}
                  className="w-full bg-ink text-paper hover:bg-gold hover:text-ink font-semibold gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Зарегистрироваться бесплатно
                  <ArrowRight className="h-4 w-4 ml-auto" />
                </Button>
                <Button
                  onClick={handlePayment}
                  variant="outline"
                  className="w-full border-gold text-gold-deep hover:bg-gold hover:text-ink gap-2"
                >
                  <Crown className="h-4 w-4" />
                  Подписка — от 9 000 ₽/мес
                </Button>
              </>
            ) : (
              <Button
                onClick={handlePayment}
                className="w-full bg-ink text-paper hover:bg-gold hover:text-ink font-semibold gap-2"
              >
                <Crown className="h-4 w-4" />
                Оформить подписку — от 9 000 ₽/мес
                <ArrowRight className="h-4 w-4 ml-auto" />
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full text-ink/55 hover:text-ink"
            >
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
