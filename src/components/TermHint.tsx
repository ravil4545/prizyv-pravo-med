import { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Мини-глоссарий призывных терминов. Аудитория — призывники 18–27 лет,
// канцелярит военкомата им незнаком. Popover вместо Tooltip — открывается
// по тапу и на мобильных устройствах.
const TERMS = {
  rb: {
    title: "Расписание болезней (РБ-565)",
    text: "Таблица из 88 статей в Постановлении Правительства №565: какой диагноз какой категории годности соответствует. Именно по ней врачи военкомата выносят решение.",
  },
  vve: {
    title: "ВВЭ — военно-врачебная экспертиза",
    text: "Медицинское освидетельствование в военкомате: врачи изучают ваши документы, осматривают и присваивают категорию годности.",
  },
  kmo: {
    title: "КМО — контрольное медицинское освидетельствование",
    text: "Повторная проверка решения врачебной комиссии на уровне региона. Назначается при жалобе или для подтверждения «непризывной» категории.",
  },
  category: {
    title: "Категории годности",
    text: "А — годен; Б — годен с незначительными ограничениями; В — ограниченно годен (зачисляют в запас, в мирное время не призывают); Г — временно не годен (отсрочка на лечение); Д — не годен.",
  },
  chanceB: {
    title: "Сила подтверждений",
    text: "Оценка ИИ от 0 до 100: насколько загруженный документ подтверждает критерии статьи Расписания болезней. Это не вероятность решения комиссии и не юридическое заключение.",
  },
} as const;

export type TermKey = keyof typeof TERMS;

interface TermHintProps {
  term: TermKey;
  /** Текст-триггер с пунктирным подчёркиванием; без children — только иконка «?». */
  children?: ReactNode;
  className?: string;
}

const TermHint = ({ term, children, className }: TermHintProps) => {
  const def = TERMS[term];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-0.5 text-left align-baseline",
            children
              ? "underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 hover:decoration-foreground"
              : "align-middle text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label={`Что такое: ${def.title}`}
        >
          {children}
          <HelpCircle className={children ? "h-3 w-3 opacity-60" : "h-3.5 w-3.5"} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-w-xs text-sm">
        <p className="mb-1 font-semibold">{def.title}</p>
        <p className="leading-relaxed text-muted-foreground">{def.text}</p>
      </PopoverContent>
    </Popover>
  );
};

export default TermHint;
