import { useEffect, useMemo, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useDemoMode } from "@/hooks/useDemoMode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Crown } from "lucide-react";
import PaymentInstructionsDialog from "@/components/PaymentInstructionsDialog";

/**
 * Карточка пробного периода (Модуль 2 — удержание).
 *
 * Показывает живой обратный отсчёт 7-дневного бесплатного периода, который
 * стартует с момента регистрации (trial_ends_at в user_subscriptions). По
 * клику открывает диалог оплаты с выбором тарифа месяц/год.
 *
 * Не рендерится, если: демо-режим, идёт загрузка, активна платная подписка,
 * или триал уже закончился (тогда работает обычная SubscriptionStatusCard).
 */

const pad = (n: number) => String(n).padStart(2, "0");

const daysWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "дня";
  return "дней";
};

export default function TrialCountdownCard() {
  const { loading, subscription, isTrialActive, trialEndsAt, isActive } = useSubscription();
  const { isDemoMode } = useDemoMode();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  // Тик раз в секунду, пока карточка видима.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endMs = useMemo(() => (trialEndsAt ? new Date(trialEndsAt).getTime() : 0), [trialEndsAt]);

  if (isDemoMode || loading || !subscription) return null;
  // Платная подписка — показываем обычную карточку статуса, не триал.
  if (subscription.is_paid || subscription.admin_override) return null;
  // Триал не активен (закончился или отсутствует) — пусть работает обычный апселл.
  if (!isTrialActive()) return null;

  const msLeft = Math.max(0, endMs - now);
  const totalSec = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return (
    <>
      <Card className="relative overflow-hidden border-gold/40 bg-gradient-to-br from-gold/10 via-paper-deep/40 to-background shadow-soft">
        <div className="absolute right-0 top-0 h-28 w-28 -translate-y-1/3 translate-x-1/3 rounded-full bg-gold/10" />
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-gradient-to-br from-gold to-gold-deep p-2 shadow-md">
              <Sparkles className="h-5 w-5 text-ink" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-deep">
                Пробный период · полный доступ
              </p>
              <p className="font-serif text-lg leading-tight text-ink">
                Бесплатно ещё {days} {daysWord(days)}
              </p>
            </div>
          </div>

          {/* Таймер */}
          <div className="mt-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-ink-soft" />
            <div className="flex items-end gap-1.5 font-mono">
              {[
                { v: days, l: "дн" },
                { v: hours, l: "ч" },
                { v: minutes, l: "мин" },
                { v: seconds, l: "сек" },
              ].map((u, i) => (
                <div key={u.l} className="flex items-end gap-1.5">
                  {i > 0 && <span className="pb-4 text-ink/40">:</span>}
                  <div className="flex flex-col items-center">
                    <span className="min-w-[2ch] rounded-md bg-ink px-1.5 py-1 text-center text-lg font-semibold text-paper tabular-nums">
                      {u.l === "дн" ? days : pad(u.v)}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-wider text-ink-soft">{u.l}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-sm text-ink-soft">
            После окончания пробного периода доступ к безлимиту сохранится только с подпиской.
            Оформите заранее, чтобы не прерывать работу над делом.
          </p>

          {/* Оба тарифа */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => setPaymentOpen(true)}
              className="flex-1 gap-2 bg-ink text-paper hover:bg-gold hover:text-ink"
            >
              <Crown className="h-4 w-4" />
              Подписка на год — 9 900 ₽
            </Button>
            <Button
              variant="outline"
              onClick={() => setPaymentOpen(true)}
              className="flex-1 border-ink/20"
            >
              Помесячно — 990 ₽
            </Button>
          </div>
        </CardContent>
      </Card>

      <PaymentInstructionsDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </>
  );
}
