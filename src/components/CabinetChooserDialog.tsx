import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { cn } from "@/lib/utils";
import { User, Briefcase, Lock, ChevronRight } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Всплывашка выбора кабинета. Личный кабинет и кабинет юриста — РАЗДЕЛЬНЫЕ
 * пространства (одна роль на аккаунт): у юриста нет клиентского кабинета,
 * у обычного пользователя нет кабинета юриста. Недоступная роль показывается
 * как заблокированная карточка с подсказкой.
 */
const CabinetChooserDialog = ({ open, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { isLawyer } = useLawyerProfile();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Выберите кабинет</DialogTitle>
          <DialogDescription>
            Личный кабинет и кабинет юриста — раздельные рабочие пространства.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Личный кабинет (клиент) */}
          <button
            type="button"
            disabled={isLawyer}
            onClick={() => go("/dashboard")}
            className={cn(
              "group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
              isLawyer
                ? "opacity-50 cursor-not-allowed bg-muted/30"
                : "hover:border-primary hover:bg-primary/5",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </span>
              {isLawyer ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              )}
            </div>
            <span className="font-semibold">Личный кабинет</span>
            <span className="text-xs text-muted-foreground">
              {isLawyer
                ? "У юриста отдельный рабочий кабинет"
                : "Документы, ИИ-консультант, дела призывника"}
            </span>
          </button>

          {/* Кабинет юриста */}
          <button
            type="button"
            disabled={!isLawyer}
            onClick={() => go("/lawyer")}
            className={cn(
              "group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
              !isLawyer
                ? "opacity-50 cursor-not-allowed bg-muted/30"
                : "hover:border-gold hover:bg-gold/5",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/15 text-gold-deep">
                <Briefcase className="h-5 w-5" />
              </span>
              {!isLawyer ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              )}
            </div>
            <span className="font-semibold">Кабинет юриста</span>
            <span className="text-xs text-muted-foreground">
              {isLawyer ? "CRM, клиенты, стратегия дела" : "Только для юристов"}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CabinetChooserDialog;
