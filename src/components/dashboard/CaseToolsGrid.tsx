import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CASE_TOOLS } from "@/lib/cabinetNav";
import { withBrandPath } from "@/lib/brandPath";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════════════
//  Инструменты дела (§4).
//
//  Меню кабинета сокращено с 12 пунктов до 7. Убранные оттуда инструменты —
//  шаблоны, опросник, личная сверка со статьями, календарь, каталог юристов —
//  не потерялись: они собраны здесь, на странице ведения дела, то есть в том
//  месте, где реально нужны. Раньше они висели в общем списке и конкурировали
//  за внимание с разделами.
// ════════════════════════════════════════════════════════════════════════

interface Props {
  className?: string;
}

const CaseToolsGrid = ({ className }: Props) => {
  // Как и везде в кабинете, брендовый префикс берём из текущего пути
  // (см. DashboardPage, CalendarPage, MedicalDocumentsPage).
  const location = useLocation();

  return (
    <section className={cn("border border-ink/15 bg-paper p-5 sm:p-6", className)}>
      <h2 className="font-serif text-lg text-ink mb-1">Инструменты дела</h2>
      <p className="text-sm text-ink-soft mb-4">
        Всё, что может понадобиться по ходу — под рукой, но не мешает в меню.
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CASE_TOOLS.map((tool) => {
          const Icon = tool.icon;
          // Брендовые маршруты /u/:slug/* — кроме помеченных external
          // (публичный каталог юристов общий для всех).
          const to = tool.external ? tool.to : withBrandPath(location.pathname, tool.to);
          return (
            <li key={tool.to}>
              <Link
                to={to}
                className="group flex items-center gap-3 border border-ink/15 px-4 py-3 hover:border-gold hover:bg-gold/5 transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0 text-gold" />
                <span className="text-sm text-ink flex-1 min-w-0 truncate">{tool.label}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default CaseToolsGrid;
