import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import { Calendar, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Единая «Лента дела» — переиспользуемый таймлайн для клиента и юриста.
 *
 * Раньше клиент видел свои события в CaseTrackingPage, а юрист — заметки на
 * вкладке «История», но визуально это были две разные ленты. Этот компонент —
 * один источник вёрстки: страница собирает массив `TimelineItem[]` из своих
 * таблиц (case_events / case_notes / смены стадии) и отдаёт сюда.
 *
 * Презентационный: никакой загрузки данных и побочных эффектов, только рендер.
 */
export interface TimelineItem {
  id: string;
  /** ISO-дата или datetime события. */
  date: string;
  title: string;
  description?: string | null;
  icon: LucideIcon;
  /** Tailwind bg-* для подсветки маркера (мягкая заливка). */
  dotClass: string;
  /** Подпись-чип типа (опционально). */
  typeLabel?: string;
  /** Классы для чипа типа. */
  badgeClass?: string;
  /** Произвольный правый слот: исход, действия (edit/delete), кнопки. */
  rightSlot?: React.ReactNode;
}

interface CaseTimelineProps {
  items: TimelineItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export default function CaseTimeline({
  items,
  emptyTitle = "Событий по делу пока нет",
  emptyDescription = "Здесь появятся ключевые события, документы и смены этапов.",
  className,
}: CaseTimelineProps) {
  if (items.length === 0) {
    return <EmptyState icon={Calendar} title={emptyTitle} description={emptyDescription} size="sm" />;
  }

  return (
    <div className={cn("relative", className)}>
      {/* Вертикальная линия таймлайна (выровнена по центру маркеров 36px). */}
      <div className="absolute left-[1.0625rem] top-2 bottom-2 w-0.5 bg-border/60 hidden sm:block" />

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="flex gap-3 sm:gap-4 relative">
              {/* Маркер с иконкой типа */}
              <div className="hidden sm:flex items-start pt-3">
                <div className="relative z-10 h-9 w-9 rounded-full flex items-center justify-center bg-card border border-border ring-4 ring-background">
                  <span className={cn("absolute inset-0 rounded-full opacity-15", item.dotClass)} />
                  <Icon className="relative h-4 w-4 text-foreground" />
                </div>
              </div>

              <Card className="flex-1 hover:shadow-soft transition-shadow">
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {/* На мобиле иконка инлайн (линии нет) */}
                        <Icon className="h-3.5 w-3.5 text-muted-foreground sm:hidden" />
                        <span className="text-xs text-muted-foreground font-medium">
                          {format(new Date(item.date), "d MMMM yyyy", { locale: ru })}
                        </span>
                        {item.typeLabel && (
                          <Badge variant="outline" className={cn("text-[10px]", item.badgeClass)}>
                            {item.typeLabel}
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-foreground text-sm break-words">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-4">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.rightSlot && <div className="flex-shrink-0">{item.rightSlot}</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
