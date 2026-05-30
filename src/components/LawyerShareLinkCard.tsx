import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Send, MessageCircle, Share2 } from "lucide-react";

interface Props {
  /** user_id юриста — для deep-ссылки на каталог, если нет slug. */
  lawyerUserId: string;
  /** slug бренда юриста (если есть) — тогда даём /u/<slug>. */
  slug?: string | null;
}

/**
 * Ссылка для подключения клиента — замена индивидуального invite-кода.
 * Связь теперь client-initiated: юрист делится ссылкой, клиент открывает её,
 * входит/регистрируется и включает доступ из своего кабинета. Кодов нет.
 *
 * Ссылка ведёт на брендовую страницу юриста (/u/<slug>) или, если slug нет,
 * на карточку юриста в каталоге с авто-открытием (/lawyers?request=<user_id>).
 */
const LawyerShareLinkCard = ({ lawyerUserId, slug }: Props) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://nepriziv.ru";
  const path = slug ? `/u/${slug}` : `/lawyers?request=${lawyerUserId}`;
  const url = `${origin}${path}`;
  const shareText =
    `Подключитесь ко мне как к юристу на nepriziv.ru и откройте доступ к документам по ссылке: ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Ссылка скопирована" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  const openWhatsApp = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  const openTelegram = () =>
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Подключитесь ко мне как к юристу на nepriziv.ru")}`,
      "_blank",
    );

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Share2 className="h-4 w-4 text-primary" /> Ссылка для подключения клиента
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Передайте ссылку клиенту любым способом. Он откроет её, войдёт или зарегистрируется и
        включит доступ к документам из своего кабинета — без кодов. Карточка свяжется автоматически.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border bg-background px-2 py-1.5 text-xs">{url}</code>
        <Button size="sm" variant="outline" onClick={copy} className="flex-shrink-0" aria-label="Скопировать ссылку">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={openWhatsApp} className="text-emerald-600">
          <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
        </Button>
        <Button size="sm" variant="outline" onClick={openTelegram} className="text-sky-600">
          <Send className="h-3.5 w-3.5 mr-1" /> Telegram
        </Button>
      </div>
    </div>
  );
};

export default LawyerShareLinkCard;
