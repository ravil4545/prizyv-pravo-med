import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Snowflake, MessageCircle, FileText, MessagesSquare, CalendarDays, Loader2 } from "lucide-react";

const LAWYER_TELEGRAM = "https://t.me/nepriziv2";
const LAWYER_PHONE = "+7 925 350-05-33";
const FREEZE_PRICE = "390 ₽ / мес";

interface SubscriptionCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Cancel-flow удержания (Модуль 2).
 *
 * Открывается при попытке отключить подписку. Вместо мгновенной отмены —
 * предупреждаем о потере (история дела, ИИ-адвокат в разгар призыва) и
 * предлагаем альтернативу: тариф «Заморозка» 390 ₽/мес (документы, чаты и
 * календарь сохраняются, ИИ в спящем режиме).
 *
 * Оплата/отмена в проекте ручные (через юриста), поэтому здесь никакой записи
 * в БД: «Заморозить» и «Всё равно отключить» ведут к юристу (Telegram с
 * заготовленным текстом + телефон), плюс тихое уведомление notify-payment-click.
 */
export default function SubscriptionCancelDialog({ open, onOpenChange }: SubscriptionCancelDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"offer" | "confirm">("offer");
  const [notifying, setNotifying] = useState(false);

  const notifyLawyer = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("notify-payment-click", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
    } catch (e) {
      console.error("notify-payment-click failed", e);
    }
  };

  const openTelegram = (text: string) => {
    window.open(`${LAWYER_TELEGRAM}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleFreeze = async () => {
    setNotifying(true);
    await notifyLawyer();
    setNotifying(false);
    openTelegram("Здравствуйте! Хочу перейти на тариф «Заморозка» (390 ₽/мес) — сохранить документы и историю на межпризывной период.");
    toast({ title: "Запрос отправлен", description: "Юрист поможет оформить «Заморозку». Открыли чат в Telegram." });
    onOpenChange(false);
    setStep("offer");
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep("offer");
  };

  const losses = [
    { icon: FileText, text: "История болезни и все загруженные документы" },
    { icon: MessagesSquare, text: "Переписка с ИИ-адвокатом и юристом" },
    { icon: CalendarDays, text: "Календарь дедлайнов и напоминания" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === "offer" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Snowflake className="h-5 w-5 text-sky-500" />
                Не торопитесь отключать
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Отключение подписки в разгар призывных мероприятий означает потерю доступа к
                ИИ-адвокату именно тогда, когда он нужнее всего. При отключении вы рискуете потерять:
              </p>

              <ul className="space-y-2">
                {losses.map((l) => {
                  const Icon = l.icon;
                  return (
                    <li key={l.text} className="flex items-start gap-2.5 text-sm">
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive/70" />
                      <span className="text-foreground/80">{l.text}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Альтернатива — Заморозка */}
              <div className="rounded-xl border border-sky-500/30 bg-sky-50/60 p-4 dark:bg-sky-950/20">
                <div className="flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-semibold text-foreground">Тариф «Заморозка»</span>
                  <span className="ml-auto font-serif text-lg text-sky-700 dark:text-sky-300">{FREEZE_PRICE}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Сохраняем всю вашу базу: документы, историю чатов и календарь. ИИ переходит
                  в спящий режим до следующего призыва — платите меньше, ничего не теряете.
                </p>
                <ul className="mt-3 space-y-1 text-xs text-foreground/70">
                  <li>· Все документы и история болезни — на месте</li>
                  <li>· Доступ к календарю и напоминаниям сохраняется</li>
                  <li>· Вернуть полный доступ можно в один клик в любой момент</li>
                </ul>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="ghost"
                  onClick={() => setStep("confirm")}
                  className="order-2 flex-1 text-muted-foreground hover:text-foreground sm:order-1"
                >
                  Всё равно отключить
                </Button>
                <Button
                  onClick={handleFreeze}
                  disabled={notifying}
                  className="order-1 flex-1 gap-2 bg-sky-600 text-white hover:bg-sky-700 sm:order-2"
                >
                  {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
                  Заморозить за 390 ₽
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Отключение подписки</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Отмена подписки оформляется через вашего юриста — чтобы корректно сохранить ваши
                данные и при необходимости перевести вас на «Заморозку». Напишите в Telegram или
                позвоните, и мы всё оформим.
              </p>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() =>
                    openTelegram("Здравствуйте! Хочу отключить подписку на ИИ-кабинет nepriziv.ru.")
                  }
                  variant="outline"
                  className="gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Написать юристу в Telegram
                </Button>
                <a
                  href={`tel:${LAWYER_PHONE.replace(/\s/g, "")}`}
                  className="text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  или позвонить: {LAWYER_PHONE}
                </a>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="ghost" onClick={() => setStep("offer")} className="flex-1">
                  ← Назад к «Заморозке»
                </Button>
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Закрыть
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
