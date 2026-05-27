import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

interface DeleteAccountDialogProps {
  /** Чтобы кнопка-триггер выглядела ожидаемо снаружи */
  triggerLabel?: string;
  /** Опциональный кастомный триггер; если не задан — рендерим стандартную кнопку */
  children?: React.ReactNode;
}

const CONFIRM_PHRASE = "УДАЛИТЬ";

/**
 * Диалог безвозвратного удаления аккаунта. Двойная защита:
 *  1. Текстовое подтверждение — пользователь вводит «УДАЛИТЬ»
 *  2. Edge-функция delete-user-account дополнительно проверяет фразу
 *
 * После успеха разлогиниваемся и редиректим на главную.
 */
const DeleteAccountDialog = ({ triggerLabel = "Удалить аккаунт", children }: DeleteAccountDialogProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);

  const valid = phrase.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleDelete = async () => {
    if (!valid) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Сессия не найдена");

      const { data, error } = await supabase.functions.invoke("delete-user-account", {
        body: { confirmation: CONFIRM_PHRASE },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(error.message || "Не удалось удалить аккаунт");
      if (data?.error) throw new Error(data.error);

      // Уходим из сессии и редиректим
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      toast({ title: "Аккаунт удалён", description: "До свидания. Все данные стёрты." });
      navigate("/", { replace: true });
      // Перезагружаем чтобы все React-Query кеши и контексты сбросились
      setTimeout(() => window.location.reload(), 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Ошибка удаления", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children || (
          <Button variant="destructive" size="sm" className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Удалить аккаунт безвозвратно?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              Будут удалены: ваш профиль, медицинские документы, история ИИ-анализов,
              переписка с юристом{" "}
              <span className="text-destructive font-medium">(если вы юрист — также CRM-карточки клиентов и брендированная страница)</span>.
            </span>
            <span className="block font-semibold text-foreground">
              Отменить это действие будет невозможно.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-phrase" className="text-sm">
            Введите слово <span className="font-mono text-destructive">{CONFIRM_PHRASE}</span> ниже, чтобы подтвердить
          </Label>
          <Input
            id="confirm-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            disabled={deleting}
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={!valid || deleting}
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Удаление...</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-1.5" />Удалить навсегда</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAccountDialog;
