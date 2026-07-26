import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { withBrandPath } from "@/lib/brandPath";
import { cn } from "@/lib/utils";

/**
 * Возврат на родительскую страницу.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ КОМПОНЕНТ. Страницы из блока «Инструменты дела»
 * (`CASE_TOOLS` в cabinetNav) — глубокие: их НЕТ ни в сайдбаре, ни в нижних
 * табах, попасть туда можно только со страницы «Моё дело». Выход с них был
 * сделан по-разному: на «Истории болезни» — текстовая кнопка «Назад» в
 * правом верхнем углу, рядом с кнопкой действия «Опросник», из-за чего она
 * читалась как ещё одно действие, а не как навигация. Взгляд ищет возврат
 * слева и сверху — там его и ставим.
 *
 * Осознанно НЕ используем navigate(-1). История браузера может вести куда
 * угодно: на страницу входа, на внешний сайт, или быть пустой при заходе по
 * прямой ссылке из письма. Явный адрес предсказуем.
 *
 * Брендовые зеркала /u/:slug учитываются через withBrandPath — иначе
 * возврат выбрасывал бы клиента из брендированного кабинета юриста.
 */
export interface BackLinkProps {
  /** Куда возвращаемся. Глобальный путь, без префикса /u/:slug. */
  to: string;
  /** Подпись. По умолчанию — «Назад». */
  label?: string;
  className?: string;
}

export default function BackLink({ to, label = "Назад", className }: BackLinkProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <button
      type="button"
      onClick={() => navigate(withBrandPath(location.pathname, to))}
      className={cn(
        // min-h-11 — палец на телефоне: цель меньше 44px промахивается.
        "inline-flex items-center gap-1.5 -ml-2 px-2 min-h-11 rounded-lg",
        "text-sm font-medium text-muted-foreground",
        "hover:text-foreground hover:bg-muted/60 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}
