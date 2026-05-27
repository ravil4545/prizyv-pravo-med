import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, Mail, Briefcase } from "lucide-react";

interface LawyerPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TG_NUMBER = "+79253500533";
const WA_NUMBER = "79253500533";
const EMAIL = "dompc9@gmail.com";

const PARTNER_MESSAGE =
  "Здравствуйте! Хочу стать юристом-партнёром nepriziv.ru. " +
  "Готов(а) обсудить условия подключения и тариф.";

/**
 * Диалог «Стать юристом-партнёром» — даёт выбор канала связи:
 * Telegram / WhatsApp / Email. Никаких форм на сайте, всё идёт сразу человеку.
 */
const LawyerPartnerDialog = ({ open, onOpenChange }: LawyerPartnerDialogProps) => {
  const handleTelegram = () => {
    // Telegram не открывает +номер напрямую — у админа на этот номер заведён
    // аккаунт; используем deep link на phone-username нельзя, поэтому
    // открываем по номеру через универсальную ссылку wa.me не годится,
    // используем tg://resolve если есть юзернейм, иначе t.me/+номер.
    const url = `https://t.me/+${TG_NUMBER.replace(/\D/g, "")}`;
    window.open(url, "_blank");
  };
  const handleWhatsApp = () => {
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(PARTNER_MESSAGE)}`;
    window.open(url, "_blank");
  };
  const handleEmail = () => {
    const subject = encodeURIComponent("Заявка на партнёрство — юрист nepriziv.ru");
    const body = encodeURIComponent(PARTNER_MESSAGE);
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl">
            <Briefcase className="h-5 w-5 text-primary" />
            Стать юристом-партнёром
          </DialogTitle>
          <DialogDescription>
            Свяжитесь с командой nepriziv.ru удобным способом — подключим
            ваш личный кабинет с CRM и брендированной страницей.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Button
            onClick={handleTelegram}
            variant="outline"
            className="w-full justify-start h-auto py-3"
          >
            <Send className="h-5 w-5 mr-3 text-sky-500" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">Telegram</span>
              <span className="text-xs text-muted-foreground">{TG_NUMBER}</span>
            </div>
          </Button>

          <Button
            onClick={handleWhatsApp}
            variant="outline"
            className="w-full justify-start h-auto py-3"
          >
            <MessageCircle className="h-5 w-5 mr-3 text-emerald-500" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">WhatsApp</span>
              <span className="text-xs text-muted-foreground">{TG_NUMBER}</span>
            </div>
          </Button>

          <Button
            onClick={handleEmail}
            variant="outline"
            className="w-full justify-start h-auto py-3"
          >
            <Mail className="h-5 w-5 mr-3 text-amber-500" />
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">Электронная почта</span>
              <span className="text-xs text-muted-foreground">{EMAIL}</span>
            </div>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Обычно отвечаем в течение рабочего дня.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default LawyerPartnerDialog;
