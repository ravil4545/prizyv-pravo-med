import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Единый чип статуса ИИ-анализа документа: «В анализе» / «Готов» / «Ожидание».
 *
 * Раньше статус собирался ad-hoc в разных местах таблицы (и по-разному на
 * мобиле/десктопе). Этот компонент — один источник вида, переиспользуется
 * в таблице документов и в мобильном представлении.
 */
interface DocumentAnalysisStatusChipProps {
  isAnalyzing: boolean;
  isClassified: boolean;
  /** Компактный размер для мобильных карточек/ячеек. */
  compact?: boolean;
  className?: string;
}

export default function DocumentAnalysisStatusChip({
  isAnalyzing,
  isClassified,
  compact,
  className,
}: DocumentAnalysisStatusChipProps) {
  const sizeCls = compact ? "text-[10px] px-1.5 py-0 h-5 gap-1" : "gap-1";
  const iconCls = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  if (isAnalyzing) {
    return (
      <Badge variant="outline" className={cn("animate-pulse", sizeCls, className)}>
        <Loader2 className={cn("animate-spin", iconCls)} />
        В анализе
      </Badge>
    );
  }

  if (isClassified) {
    return (
      <Badge variant="default" className={cn(sizeCls, className)}>
        <Check className={iconCls} />
        Готов
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("text-muted-foreground", sizeCls, className)}>
      <Clock className={iconCls} />
      Ожидание
    </Badge>
  );
}
