import { Link } from "react-router-dom";
import { ChevronDown, ShieldCheck, Eye, Bot, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Раскрывашка «Кто видит мои данные?» — отвечает на главный страх аудитории
// (медицинские данные + военкомат) простым языком, без канцелярита.
const PrivacyExplainer = ({ className }: { className?: string }) => (
  <Collapsible
    className={cn(
      "rounded-lg border border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
      className,
    )}
  >
    <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
      <ShieldCheck className="h-4 w-4 flex-shrink-0" />
      Кто видит мои данные?
      <ChevronDown className="ml-auto h-4 w-4 flex-shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ul className="space-y-2 px-3 pb-3 pt-1">
        <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" />
          Документы и профиль видны только вам — доступ по вашей учётной записи.
        </li>
        <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
          <Eye className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" />
          Юрист получает доступ к досье только после того, как вы сами включите его
          (тумблер в блоке «Мои юристы» на главной). Отключить можно в любой момент.
        </li>
        <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
          <Bot className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" />
          ИИ-анализ выполняется автоматически: содержимое документа обрабатывается
          только для разбора вашего дела, другие пользователи его не видят.
        </li>
        <li className="flex items-start gap-2 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
          <Trash2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-70" />
          <span>
            Аккаунт и все данные можно удалить безвозвратно (Профиль → «Удалить аккаунт»).
            Подробнее — в{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:opacity-80">
              Политике конфиденциальности
            </Link>.
          </span>
        </li>
      </ul>
    </CollapsibleContent>
  </Collapsible>
);

export default PrivacyExplainer;
