import { useMemo } from "react";
import { Info } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseArticleBody, CATEGORY_META, categoryBase, GRAPH_INFO } from "@/lib/rb565";

const CATEGORY_ORDER = ["А", "Б", "В", "Г", "Д"] as const;

/** Бейдж категории годности по токену графы («Д», «Б-3», «Б (В - ИНД)»). */
function CategoryBadge({ token }: { token: string }) {
  const value = (token || "").trim();
  if (!value || /^[-–—]$/.test(value))
    return (
      <span title="Категория для этой графы не предусмотрена" className="text-muted-foreground">
        —
      </span>
    );
  const meta = CATEGORY_META[categoryBase(value)];
  return (
    <span
      title={meta?.meaning}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold ${
        meta?.badgeClass ?? "border-border bg-muted text-foreground"
      }`}
    >
      {value}
    </span>
  );
}

interface RbArticleViewProps {
  body: string | null | undefined;
}

/**
 * Визуально структурированный официальный текст статьи РБ-565:
 * таблица «пункт → категория годности по графам» + разбор пунктов и общие положения.
 */
export default function RbArticleView({ body }: RbArticleViewProps) {
  const parsed = useMemo(() => parseArticleBody(body), [body]);

  if (!parsed.hasStructure) {
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs leading-relaxed sm:text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-amber-900 dark:text-amber-200">
          Полный официальный текст этой статьи с таблицей категорий готовится. Уточнить условия можно в разделе{" "}
          <strong>«База знаний»</strong> или в действующей редакции «Расписания болезней» (Постановление Правительства РФ
          № 565).
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-5">
      {/* Таблица категорий годности */}
      <div>
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="w-12 text-center font-semibold text-foreground">Пункт</TableHead>
                <TableHead className="font-semibold text-foreground">Степень нарушения функции</TableHead>
                <TableHead className="w-24 bg-primary/5 text-center font-semibold text-foreground">
                  Графа&nbsp;I
                </TableHead>
                <TableHead className="w-24 text-center font-semibold text-foreground">Графа&nbsp;II</TableHead>
                <TableHead className="w-24 text-center font-semibold text-foreground">Графа&nbsp;III</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.points.map((p) => (
                <TableRow key={p.letter} className="align-top">
                  <TableCell className="text-center align-top font-bold">{p.letter})</TableCell>
                  <TableCell className="align-top text-xs leading-relaxed sm:text-sm">{p.description}</TableCell>
                  <TableCell className="bg-primary/5 text-center align-top">
                    <CategoryBadge token={p.graphs[0]} />
                  </TableCell>
                  <TableCell className="text-center align-top">
                    <CategoryBadge token={p.graphs[1]} />
                  </TableCell>
                  <TableCell className="text-center align-top">
                    <CategoryBadge token={p.graphs[2]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Легенда: категории и графы */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Категории годности
            </p>
            <ul className="space-y-1.5">
              {CATEGORY_ORDER.map((k) => (
                <li key={k} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${CATEGORY_META[k].dotClass}`}
                  >
                    {k}
                  </span>
                  <span className="text-muted-foreground">{CATEGORY_META[k].meaning}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Графы расписания
            </p>
            <ul className="space-y-1.5">
              {GRAPH_INFO.map((g) => (
                <li key={g.key} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-0.5 inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      g.primary ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {g.label}
                  </span>
                  <span className="text-muted-foreground">{g.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Разбор пунктов */}
      {parsed.pointExplanations.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Что относится к пунктам
          </h4>
          <div className="space-y-3">
            {parsed.pointExplanations.map((ex, idx) => (
              <div key={idx} className="rounded-r-lg border-l-2 border-primary/30 bg-muted/20 py-2 pl-3 pr-2">
                <p className="mb-1 text-sm font-semibold">{ex.title}</p>
                <div className="space-y-1.5">
                  {ex.paragraphs.map((para, i) => (
                    <p key={i} className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Общие положения */}
      {parsed.notes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Общие положения</h4>
          <div className="space-y-1.5">
            {parsed.notes.map((note, i) => (
              <p key={i} className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {note}
              </p>
            ))}
          </div>
        </div>
      )}

      {parsed.hasEdits && (
        <p className="text-[11px] italic leading-relaxed text-muted-foreground">
          Приведён официальный текст «Расписания болезней» с учётом изменений (в т.ч. Постановление Правительства РФ
          № 1314 от 29.08.2025). Сверяйтесь с действующей редакцией.
        </p>
      )}
    </div>
  );
}
