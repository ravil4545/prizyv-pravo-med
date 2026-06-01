import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import SummonsUploadDialog from "@/components/SummonsUploadDialog";

/**
 * «Экстренный аудит» (Модуль 2 — удержание).
 *
 * Сквозная плавающая кнопка в кабинете: призывнику что-то выдали в военкомате
 * (повестку, направление, акт) — он сразу загружает это сюда и за ~30 секунд
 * получает ИИ-разбор. Переиспользует SummonsUploadDialog (распознавание через
 * edge-функцию parse-summons + запись в case_events), так что событие сразу
 * попадает в календарь и трекинг дела.
 *
 * Позиционирование: справа снизу, выше нижней мобильной навигации. На страницах
 * чата прячемся, чтобы не перекрывать поле ввода.
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
          "fixed right-4 bottom-20 z-40 md:right-6 md:bottom-6",
          "inline-flex items-center gap-2 rounded-full pl-4 pr-5 py-3",
          "bg-rose-600 text-white shadow-xl shadow-rose-600/25",
          "transition-transform hover:scale-[1.03] active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2",
        )}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" />
          <ShieldAlert className="relative h-5 w-5" />
        </span>
        <span className="text-sm font-semibold">Экстренный аудит</span>
      </button>

      <SummonsUploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
