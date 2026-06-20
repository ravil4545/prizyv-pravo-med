import LawyerCasePlanner from "@/components/LawyerCasePlanner";
import LawyerCaseAssistant from "@/components/LawyerCaseAssistant";
import { ListChecks, HelpCircle, type LucideIcon } from "lucide-react";

/**
 * Единый поток вкладки «Стратегия».
 *
 * Раньше планировщик и ассистент висели рядом без иерархии — юрист не понимал,
 * что за чем делать. Теперь это один последовательный поток: анализ (соседняя
 * вкладка) → план дела → точечные вопросы. Логику компонентов не трогаем —
 * только задаём порядок и общий контекст. Pro-гейт у обоих общий (onUpgrade).
 */
interface Props {
  lawyerClientId: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const StepHeader = ({ n, icon: Icon, title, hint }: { n: number; icon: LucideIcon; title: string; hint: string }) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
      {n}
    </div>
    <div className="min-w-0">
      <h3 className="font-semibold text-sm flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  </div>
);

export default function LawyerCaseStrategyFlow({ lawyerClientId, isPro, onUpgrade }: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground leading-relaxed">
        Единый поток работы по делу: <strong className="text-foreground">1.</strong> запустите ИИ-анализ на
        вкладке «ИИ-анализ» → <strong className="text-foreground">2.</strong> постройте план дообследований и
        действий → <strong className="text-foreground">3.</strong> задайте точечные вопросы ИИ-ассистенту.
      </div>

      <div className="space-y-3">
        <StepHeader
          n={1}
          icon={ListChecks}
          title="План дела"
          hint="Дообследования и действия: ИИ-черновик + ручное ведение."
        />
        <LawyerCasePlanner lawyerClientId={lawyerClientId} isPro={isPro} onUpgrade={onUpgrade} />
      </div>

      <div className="space-y-3">
        <StepHeader
          n={2}
          icon={HelpCircle}
          title="Вопрос по делу"
          hint="Свободный вопрос ИИ-ассистенту — со ссылками на Расписание болезней и документы дела."
        />
        <LawyerCaseAssistant lawyerClientId={lawyerClientId} isPro={isPro} onUpgrade={onUpgrade} />
      </div>
    </div>
  );
}
