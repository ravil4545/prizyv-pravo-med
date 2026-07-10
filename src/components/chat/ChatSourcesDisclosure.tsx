import type { ChatResponseMetadata } from "@/lib/openaiSse";

const CATEGORY_LABELS: Record<string, string> = {
  medical_condition: "Медицинская экспертиза",
  legal_procedure: "Юридическая процедура",
  document_guide: "Документы",
  faq: "Разъяснение эксперта",
  schedule_rb: "Расписание болезней",
  rb_official: "Официальный текст РБ",
  reference: "Справочный материал",
  strategy: "Стратегия защиты",
  precedent: "Обезличенный прецедент",
};

const CONFIDENCE_LABELS = {
  high: "Подборка хорошо подтверждена",
  medium: "Найдены релевантные материалы",
  low: "Источников недостаточно для уверенного вывода",
} as const;

interface ChatSourcesDisclosureProps {
  metadata?: ChatResponseMetadata;
}

export function ChatSourcesDisclosure({ metadata }: ChatSourcesDisclosureProps) {
  if (!metadata) return null;

  const generatedAt = new Date(metadata.generatedAt);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? null
    : generatedAt.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <details className="mt-3 rounded-xl border border-border/80 bg-muted/30 text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground marker:text-muted-foreground">
        Источники и актуальность
      </summary>
      <div className="space-y-2 border-t border-border/70 px-3 py-2.5 text-muted-foreground">
        <p>
          {CONFIDENCE_LABELS[metadata.confidence]}
          {generatedLabel ? ` · подбор выполнен ${generatedLabel}` : ""}
        </p>
        {metadata.sources.length > 0 ? (
          <ul className="space-y-2">
            {metadata.sources.map((source) => (
              <li key={`${source.path || source.title}-${source.articles.join("-")}`} className="rounded-lg bg-background/70 px-2.5 py-2">
                <p className="font-medium text-foreground">{source.title}</p>
                <p className="mt-0.5">
                  {source.category ? CATEGORY_LABELS[source.category] || source.category : "Экспертный материал"}
                  {source.articles.length > 0 ? ` · статьи ${source.articles.join(", ")}` : ""}
                </p>
                {source.path && <p className="mt-1 break-all text-[10px] opacity-75">{source.path}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p>Для этого ответа точные материалы не найдены. Уточните диагноз, документ или этап процедуры.</p>
        )}
      </div>
    </details>
  );
}
