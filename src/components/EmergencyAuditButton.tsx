import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import SummonsUploadDialog from "@/components/SummonsUploadDialog";

/**
 * «Экстренный аудит» (Модуль 2 — удержание).
 *
 * Контекстная кнопка в разделах документов и сроков: призывнику что-то выдали в военкомате
 * (повестку, направление, акт) — он сразу загружает это сюда и за ~30 секунд
 * получает ИИ-разбор. Переиспользует SummonsUploadDialog (распознавание через
 * edge-функцию parse-summons + запись в case_events), так что событие сразу
 * попадает в календарь и трекинг дела.
 *
 * На мобильном это компактная иконка выше нижней навигации; полный текст
 * остаётся на десктопе. DashboardLayout ограничивает список маршрутов.
 */
export default function EmergencyAuditButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // На страницах чата с ИИ кнопка мешала бы полю ввода — прячем.
  if (/\/ai-chat(\/|$)/.test(location.pathname)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Экстренный аудит — загрузить повестку или документ из военкомата"
        className={cn(
          "fixed right-3 bottom-[72px] z-40 md:right-6 md:bottom-6",
          "inline-flex h-11 w-11 items-center justify-center rounded-full md:h-auto md:w-auto md:gap-2 md:py-2.5 md:pl-3.5 md:pr-4",
          "bg-rose-600 text-white shadow-xl shadow-rose-600/25",
          "transition-transform hover:scale-[1.03] active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2",
        )}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <ShieldAlert className="relative h-5 w-5" />
        </span>
        <span className="sr-only text-sm font-semibold md:not-sr-only">Разобрать документ</span>
      </button>

      <SummonsUploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
