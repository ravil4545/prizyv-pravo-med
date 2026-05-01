import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, UserPlus, Sparkles, FileText, MessageSquare } from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            Лимит {label} исчерпан
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-muted-foreground text-sm">
            {isDemoMode
              ? `Вы использовали все бесплатные ${label} в демо-режиме. Зарегистрируйтесь бесплатно — получите ещё 3 ${label}.`
              : `Вы использовали все бесплатные ${label}. Оформите подписку для безлимитного доступа.`}
          </p>

          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">Что даёт подписка:</p>
            {["Безлимитные загрузки документов", "Безлимитные вопросы к ИИ", "Приоритетная поддержка", "Генерация документов"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {isDemoMode ? (
              <>
                <Button onClick={handleRegister} className="w-full bg-primary hover:bg-primary/90 text-white font-semibold">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Зарегистрироваться бесплатно
                </Button>
                <Button onClick={handlePayment} variant="outline" className="w-full">
                  <Crown className="h-4 w-4 mr-2" />
                  Оформить подписку — 990 ₽/мес
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handlePayment} className="w-full bg-gradient-to-r from-accent to-primary hover:opacity-90 text-white font-semibold">
                  <Crown className="h-4 w-4 mr-2" />
                  Оформить подписку — 990 ₽/мес
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
