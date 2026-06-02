import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, MessageCircle, Loader2, Crown, Check, Copy } from "lucide-react";

const LAWYER_TELEGRAM = "https://t.me/nepriziv2";
const LAWYER_PHONE = "+7 925 350-05-33";

type PlanId = "month" | "year";

interface Plan {
  id: PlanId;
  url: string;
  priceLabel: string;
  unit: string;
  note?: string;
}

const PLANS: Record<PlanId, Plan> = {
  month: {
    id: "month",
    url: "https://yoomoney.ru/bill/pay/1FUPNGI39FP.260215",
    priceLabel: "990 ₽",
    unit: "в месяц",
  },
  year: {
    id: "year",
    url: "https://yoomoney.ru/bill/pay/1I54F0JNBCS.260602",
    priceLabel: "9 900 ₽",
    unit: "в год",
    note: "≈ 825 ₽/мес · экономия 1 980 ₽",
  },
};

interface PaymentInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentInstructionsDialog({ open, onOpenChange }: PaymentInstructionsDialogProps) {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [userIdShort, setUserIdShort] = useState<string | null>(null);
  const [planId, setPlanId] = useState<PlanId>("year");

  const handleOpenPayment = async () => {
    setOpening(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Передаём user_id в YooMoney через label — пригодится для будущего webhook
      const base = PLANS[planId].url;
      const url = userId
        ? `${base}?label=${encodeURIComponent(`uid:${userId}`)}`
        : base;

      window.open(url, "_blank", "noopener,noreferrer");
      setOpened(true);
      if (userId) setUserIdShort(userId.substring(0, 8));

      // Параллельно уведомляем юриста по email о намерении оплатить
      try {
        await supabase.functions.invoke("notify-payment-click", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
      } catch (e) {
        // тихая ошибка — уведомление не критично для UX
        console.error("notify-payment-click failed", e);
      }
    } finally {
      setOpening(false);
    }
  };

  const copyUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      toast({ title: "ID скопирован" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-gold" />
            Оформление подписки на ИИ-кабинет
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Выбор тарифа */}
          <div className="border border-ink/15 bg-paper-deep/40 p-4">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              Тариф · ИИ-кабинет
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["year", "month"] as PlanId[]).map((id) => {
                const plan = PLANS[id];
                const selected = planId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlanId(id)}
                    aria-pressed={selected}
                    className={`relative rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-gold bg-gold/10"
                        : "border-ink/15 hover:border-gold/40 hover:bg-gold/5"
                    }`}
                  >
                    {id === "year" && (
                      <span className="absolute -top-2 right-2 rounded bg-gold px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink">
                        Выгодно
                      </span>
                    )}
                    <div className="font-serif text-2xl text-ink">{plan.priceLabel}</div>
                    <div className="text-xs text-ink-soft">{plan.unit}</div>
                    {plan.note && (
                      <div className="mt-1 text-[11px] font-medium text-gold-deep">{plan.note}</div>
                    )}
                  </button>
                );
              })}
            </div>

            <ul className="mt-4 space-y-1 text-sm text-ink-soft">
              <li>· Безлимитные ИИ-консультации</li>
              <li>· Безлимитная загрузка медицинских документов</li>
              <li>· Дорожная карта дела, календарь и шаблоны</li>
              <li className="text-ink/50">· Консультация юриста — за доплату, от 9 000 ₽</li>
            </ul>
          </div>

          {/* Шаги */}
          <div>
            <h3 className="font-serif text-base text-ink mb-3">Как оплатить:</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper text-xs font-mono">1</span>
                <span className="text-ink-soft">
                  Нажмите «Перейти к оплате» — откроется страница YooMoney в новой вкладке.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper text-xs font-mono">2</span>
                <span className="text-ink-soft">
                  Оплатите подписку картой или СБП. Сохраните номер чека — он понадобится для быстрого подтверждения.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper text-xs font-mono">3</span>
                <span className="text-ink-soft">
                  Доступ откроется после подтверждения юристом — обычно в течение нескольких часов в рабочее время.
                  Чтобы ускорить, пришлите номер чека в{" "}
                  <a href={LAWYER_TELEGRAM} target="_blank" rel="noopener noreferrer" className="text-gold-deep underline">
                    Telegram юриста
                  </a>{" "}
                  или позвоните по{" "}
                  <a href={`tel:${LAWYER_PHONE.replace(/\s/g, "")}`} className="text-gold-deep underline">
                    {LAWYER_PHONE}
                  </a>.
                </span>
              </li>
            </ol>
          </div>

          {/* После клика — показываем ID */}
          {opened && userIdShort && (
            <div className="border-l-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-3">
              <div className="flex items-center gap-2 mb-1 text-emerald-700 dark:text-emerald-300">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Страница оплаты открыта</span>
              </div>
              <p className="text-xs text-ink-soft mb-2">
                Если страница не открылась — проверьте блокировку всплывающих окон.
              </p>
              <button
                onClick={copyUserId}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-ink hover:text-gold-deep"
              >
                <Copy className="h-3 w-3" />
                Скопировать ID для юриста ({userIdShort}…)
              </button>
            </div>
          )}

          {/* Кнопки */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Закрыть
            </Button>
            <Button
              onClick={handleOpenPayment}
              disabled={opening}
              className="flex-1 bg-gradient-to-r from-gold to-gold-deep hover:opacity-90 text-ink font-semibold"
            >
              {opening ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Открываем...
                </>
              ) : opened ? (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Открыть оплату ещё раз
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Оплатить {PLANS[planId].priceLabel} / {planId === "year" ? "год" : "мес"}
                </>
              )}
            </Button>
          </div>

          {/* Альтернатива */}
          <div className="text-center text-xs text-ink/60">
            Сомневаетесь?{" "}
            <a
              href={LAWYER_TELEGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-gold-deep hover:underline"
            >
              <MessageCircle className="h-3 w-3" />
              Спросите юриста о тарифе
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
