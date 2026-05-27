import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Copy, RefreshCw, Loader2, Check, MessageSquare, Mail, Send } from "lucide-react";

interface InviteCodeCardProps {
  /** ID записи lawyer_clients */
  lawyerClientId: string;
  /** Текущий 8-символьный invite-код */
  inviteCode: string | null | undefined;
  /** Имя клиента — попадёт в текст готового сообщения для пересылки */
  clientName?: string;
  /** Колбэк, когда код перегенерирован (родитель обновит свой стейт клиента) */
  onCodeRegenerated?: (newCode: string) => void;
  /** Компактный вариант (без длинной инструкции) — для модалки или плитки */
  compact?: boolean;
}

/**
 * Карточка с invite-кодом юриста для приглашения клиента.
 *
 * Один источник правды UI вокруг кода — переиспользуется:
 *   • в карточке клиента (LawyerClientDetail),
 *   • в модалке сразу после создания клиента (LawyerClientsPage),
 *   • в Канбан-плитке (можно подключить).
 *
 * Что делает:
 *   – Показывает 8-символьный код крупно (для быстрого диктовки и снимка экрана).
 *   – Кнопки «Скопировать код», «Скопировать ссылку», «Поделиться WhatsApp / Telegram».
 *   – Кнопка «Обновить» — генерит новый код через RPC regenerate_lawyer_invite
 *     (на случай если старый код «утёк»).
 *
 * Если миграция invite_code ещё не применена и `inviteCode === null/undefined` —
 * показываем понятную инструкцию админу, а не пустой блок.
 */
const InviteCodeCard = ({
  lawyerClientId, inviteCode, clientName, onCodeRegenerated, compact = false,
}: InviteCodeCardProps) => {
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Отправляем приглашение клиенту прямо с сайта (через edge-функцию
  // lawyer-send-invite + Resend). Юристу не нужно копировать код или текст —
  // нажал «Отправить» и письмо ушло на client_email/target_email карточки.
  const sendByEmail = async () => {
    setSendingEmail(true);
    const { data, error } = await supabase.functions.invoke("lawyer-send-invite", {
      body: { lawyerClientId },
    });
    setSendingEmail(false);
    if (error) {
      toast({
        title: "Не удалось отправить письмо",
        description: error.message || "Проверьте, что в карточке клиента указан email",
        variant: "destructive",
      });
      return;
    }
    const sentTo = (data as any)?.sent_to;
    toast({
      title: "Приглашение отправлено",
      description: sentTo ? `Письмо ушло на ${sentTo}` : "Письмо отправлено клиенту",
    });
  };

  const inviteUrl = inviteCode
    ? `${typeof window !== "undefined" ? window.location.origin : "https://nepriziv.ru"}/dashboard?lawyer_invite=${inviteCode}`
    : "";

  const shareText = inviteCode
    ? `Здравствуйте${clientName ? ", " + clientName : ""}! Я подключил вас к своему кабинету юриста на nepriziv.ru.\n\nКод приглашения: ${inviteCode}\n\nИли откройте ссылку — код подставится автоматически:\n${inviteUrl}\n\nПосле ввода кода я смогу видеть ваши медицинские документы, а вы — писать мне в чат на сайте.`
    : "";

  const copyText = async (text: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast({ title: kind === "code" ? "Код скопирован" : "Ссылка скопирована" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    const { data, error } = await supabase.rpc("regenerate_lawyer_invite", {
      p_lawyer_client_id: lawyerClientId,
    });
    setRegenerating(false);
    if (error) {
      toast({ title: "Не удалось обновить код", description: error.message, variant: "destructive" });
      return;
    }
    onCodeRegenerated?.(data as string);
    toast({ title: "Новый код сгенерирован" });
  };

  const openShare = (channel: "wa" | "tg") => {
    if (!shareText) return;
    const encoded = encodeURIComponent(shareText);
    const url = channel === "wa"
      ? `https://wa.me/?text=${encoded}`
      : `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Без кода (миграция не применена) — показываем хелп-блок, а не пустоту.
  if (!inviteCode) {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-medium">Код приглашения недоступен</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            В вашей базе ещё не применена миграция invite-flow. Админу:
            примените <code className="bg-amber-100 dark:bg-amber-950/40 px-1 rounded">20260527002000_lawyer_invite_code.sql</code>
            {" "}в Supabase SQL Editor — после этого здесь появится 8-символьный код для отправки клиенту.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-violet-500/5">
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-3"}>
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-sm font-semibold">Код приглашения для клиента</p>
        </div>

        {!compact && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Отправьте клиенту код или ссылку любым удобным способом. Когда клиент введёт код
            в своём кабинете (или просто откроет ссылку), он автоматически (1) привяжется к этой
            карточке, (2) откроет вам доступ к медкартам и ИИ-анализам.
          </p>
        )}

        {/* Сам код крупно — чтобы было удобно диктовать или прислать скриншотом */}
        <div className="flex items-center justify-center bg-background rounded-lg border-2 border-dashed border-primary/30 py-3">
          <span className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.3em] select-all">
            {inviteCode}
          </span>
        </div>

        {/* Ряд кнопок копирования */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-w-[120px] gap-1.5"
            onClick={() => copyText(inviteCode, "code")}
          >
            {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedCode ? "Скопирован" : "Код"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-w-[120px] gap-1.5"
            onClick={() => copyText(inviteUrl, "link")}
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedLink ? "Скопирована" : "Ссылка"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={regenerate}
            disabled={regenerating}
            title="Сгенерировать новый код (старый перестанет работать)"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Обновить
          </Button>
        </div>

        {/* Быстрая отправка с готовым текстом */}
        {!compact && (
          <>
            <Button
              variant="default"
              size="sm"
              className="w-full gap-1.5 bg-primary hover:bg-primary/90"
              onClick={sendByEmail}
              disabled={sendingEmail}
              title="Письмо уйдёт с сайта на email клиента, указанный в карточке"
            >
              {sendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Отправить приглашение на email клиента
            </Button>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[140px] gap-1.5 text-emerald-700 hover:text-emerald-800 border-emerald-300"
                onClick={() => openShare("wa")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[140px] gap-1.5 text-sky-600 hover:text-sky-700 border-sky-300"
                onClick={() => openShare("tg")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Telegram
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  window.location.href = `mailto:?subject=${encodeURIComponent("Код приглашения от вашего юриста")}&body=${encodeURIComponent(shareText)}`;
                }}
              >
                <Mail className="h-3.5 w-3.5" />
                Своя почта
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default InviteCodeCard;
