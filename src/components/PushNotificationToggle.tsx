import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  isPushSupported,
  pushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/webPush";

/**
 * Тумблер web-push уведомлений (Модуль 4 Фаза 3b).
 *
 * Лёгкая кнопка: «Включить напоминания в браузере». При клике запрашивает
 * разрешение и оформляет подписку. Если браузер не поддерживает push или
 * пользователь запретил — показываем понятный статус, не ломая остальной UI.
 */
export default function PushNotificationToggle({ className }: { className?: string }) {
  const { toast } = useToast();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    setPermission(pushPermission());
  }, []);

  if (!supported) return null;

  const enabled = permission === "granted";

  const handleEnable = async () => {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    setPermission(pushPermission());
    if (res.ok) {
      toast({ title: "Push-уведомления включены", description: "Напомним о дедлайнах в браузере." });
    } else if (res.reason === "denied") {
      toast({
        title: "Уведомления заблокированы",
        description: "Разрешите уведомления для сайта в настройках браузера.",
        variant: "destructive",
      });
    } else if (res.reason === "no-auth") {
      toast({ title: "Нужен вход", description: "Войдите в аккаунт, чтобы включить push.", variant: "destructive" });
    } else {
      toast({ title: "Не удалось включить", description: "Попробуйте ещё раз позже.", variant: "destructive" });
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setPermission(pushPermission());
    toast({ title: "Push отключены", description: "Браузерные напоминания выключены." });
  };

  const blocked = permission === "denied";

  return (
    <button
      type="button"
      onClick={enabled ? handleDisable : handleEnable}
      disabled={busy || blocked}
      aria-pressed={enabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        enabled
          ? "border-emerald-600/30 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100/60 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-300"
          : blocked
            ? "cursor-not-allowed border-ink/10 bg-muted/40 text-muted-foreground"
            : "border-ink/15 bg-background text-foreground/80 hover:border-gold/40 hover:bg-gold/5",
        className,
      )}
      title={blocked ? "Уведомления заблокированы в настройках браузера" : undefined}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : enabled ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : blocked ? (
        <BellOff className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {enabled ? "Напоминания включены" : blocked ? "Уведомления заблокированы" : "Напоминания в браузере"}
    </button>
  );
}
