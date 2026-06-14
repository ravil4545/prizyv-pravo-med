import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { CreditCard, MessageCircle, Loader2, Crown, Check, Copy, Send, Mail } from "lucide-react";

const LAWYER_TELEGRAM = "https://t.me/nepriziv2";
const LAWYER_PHONE = "+7 925 350-05-33";
const LAWYER_WHATSAPP = "79253500533";
const LAWYER_EMAIL = "dompc9@gmail.com";

type PlanId = "month" | "year";

interface Plan {
  id: PlanId;
  /** Прямая ссылка YooMoney — только у тарифов с самостоятельной онлайн-оплатой. */
  url?: string;
  priceLabel: string;
  unit: string;
  note?: string;
}

// Сумма зашита в счёте YooMoney — при смене цены нужно выставить новые счета и заменить url.
// Год оформляется через юриста (выставление счёта/рассрочка) — без прямой ссылки.
const PLANS: Record<PlanId, Plan> = {
  month: {
    id: "month",
    url: "https://yoomoney.ru/bill/pay/1ID022ESTS9.260614",
    priceLabel: "4 990 ₽",
    unit: "в месяц",
  },
  year: {
    id: "year",
    priceLabel: "49 900 ₽",
    unit: "в год",
    note: "≈ 4 158 ₽/мес · экономия 9 980 ₽",
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
    const base = PLANS.month.url;
    if (!base) return;
    setOpening(true);
    trackEvent("pricing_plan_click", { ref: "subscription_month", value: 4990 });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Передаём user_id в YooMoney через label — пригодится для будущего webhook
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

  // Годовой тариф оформляется через юриста (счёт/рассрочка) — не прямой оплатой.
  // Кнопки ведут на удобный канал связи с преднабранным текстом.
  const YEAR_MSG = "Здравствуйте! Хочу оформить годовую подписку на ИИ-кабинет nepriziv.ru (49 900 ₽).";
  const openYearContact = (channel: "whatsapp" | "telegram" | "email") => {
    trackEvent("pricing_plan_click", { ref: "subscription_year", value: 49900 });
    const text = encodeURIComponent(YEAR_MSG);
    const urls: Record<typeof channel, string> = {
      whatsapp: `https://wa.me/${LAWYER_WHATSAPP}?text=${text}`,
      telegram: LAWYER_TELEGRAM,
      email: `mailto:${LAWYER_EMAIL}?subject=${encodeURIComponent("Годовая подписка ИИ-кабинет")}&body=${text}`,
    };
    window.open(urls[channel], channel === "email" ? "_self" : "_blank", "noopener,noreferrer");
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

          {/* Месяц — самостоятельная онлайн-оплата YooMoney */}
          {planId === "month" && (
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
          )}

          {/* Год — оформление через юриста (счёт/рассрочка), удобный канал связи */}
          {planId === "year" && (
          <div>
            <h3 className="font-serif text-base text-ink mb-1">Как оформить годовую подписку:</h3>
            <p className="text-sm text-ink-soft mb-3">
              Годовой тариф оформляет юрист — выставит счёт и активирует доступ. Напишите удобным
              способом, в ответ пришлём реквизиты для оплаты.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => openYearContact("whatsapp")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/30"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => openYearContact("telegram")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:bg-sky-950/30"
              >
                <Send className="h-4 w-4" />
                Telegram
              </button>
              <button
                type="button"
                onClick={() => openYearContact("email")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink/20 bg-paper px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-deep/60"
              >
                <Mail className="h-4 w-4" />
                Почта
              </button>
            </div>
            <p className="mt-3 text-xs text-ink/60">
              Или позвоните по{" "}
              <a href={`tel:${LAWYER_PHONE.replace(/\s/g, "")}`} className="text-gold-deep underline">
                {LAWYER_PHONE}
              </a>. Нужна разовая оплата картой? Выберите тариф «в месяц».
            </p>
          </div>
          )}

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
            {planId === "month" ? (
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
                    Оплатить 4 990 ₽ / мес
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => openYearContact("whatsapp")}
                className="flex-1 bg-gradient-to-r from-gold to-gold-deep hover:opacity-90 text-ink font-semibold"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Написать для оформления
              </Button>
            )}
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
