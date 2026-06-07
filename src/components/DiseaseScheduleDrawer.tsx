import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Search, ExternalLink, ChevronRight, FileSearch, X, ArrowLeft, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import RbArticleView from "@/components/RbArticleView";
import { articleFullName, articleShortName } from "@/lib/rb565";

// Статья РБ-565 для шторки юриста. ИСТОЧНИК ИСТИНЫ — таблица disease_articles_565
// (официальный текст body из «второго мозга»/rb_official + канонические названия
// через rb565.ts), а НЕ свободный diagnoses.description. Деталь рендерит
// RbArticleView — официальную таблицу «пункт → категория годности по графам».
// diagnoses.description (если есть) показываем как краткую сводку юристу.
interface RbArticle {
  id: string;
  article_number: string;
  fullName: string;   // каноническое официальное название (rb565)
  shortName: string;  // сжатая подпись для списка
  category: string | null;
  body: string | null; // официальный текст → RbArticleView
  summary: string | null; // diagnoses.description — plain-language сводка
}

interface DiseaseScheduleDrawerProps {
  /** Triggering element. If omitted — renders default button. */
  children?: React.ReactNode;
}

const numericByArticle = (a: RbArticle, b: RbArticle) => {
  const na = parseInt(a.article_number, 10);
  const nb = parseInt(b.article_number, 10);
  if (isNaN(na) || isNaN(nb)) return a.article_number.localeCompare(b.article_number);
  return na - nb;
};

/**
 * Расписание болезней (Постановление №565) внутри кабинета юриста.
 * Выезжает справа панелью, без ухода с текущей страницы. Юрист во время разговора
 * с клиентом находит статью и видит официальную таблицу категорий по графам.
 * Мобайл: показывается один экран за раз (список → деталь с кнопкой «Назад»).
 */
const DiseaseScheduleDrawer = ({ children }: DiseaseScheduleDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState<RbArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ленивая загрузка — только при первом открытии
  useEffect(() => {
    if (!open || loadedOnce) return;
    setLoading(true);
    (async () => {
      const [artsRes, diagsRes] = await Promise.all([
        supabase
          .from("disease_articles_565")
          .select("id, article_number, title, body, category")
          .eq("is_active", true),
        supabase.from("diagnoses").select("article_number, description"),
      ]);

      const summaryMap = new Map<string, string>();
      for (const d of diagsRes.data || []) {
        if (d.description) summaryMap.set(String(d.article_number), d.description);
      }

      const merged: RbArticle[] = (artsRes.data || [])
        .map((a) => {
          const num = String(a.article_number);
          const dbTitle = a.title || "";
          return {
            id: a.id,
            article_number: num,
            fullName: articleFullName(num, dbTitle),
            shortName: articleShortName(num, dbTitle),
            category: a.category || null,
            body: a.body || null,
            summary: summaryMap.get(num) || null,
          };
        })
        .sort(numericByArticle);

      setArticles(merged);
      setLoading(false);
      setLoadedOnce(true);
    })();
  }, [open, loadedOnce]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    articles.forEach((a) => a.category && set.add(a.category));
    return Array.from(set);
  }, [articles]);

  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        a.shortName.toLowerCase().includes(q) ||
        a.article_number.toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q) ||
        (a.summary || "").toLowerCase().includes(q) ||
        (a.body || "").toLowerCase().includes(q),
    );
  }, [articles, search]);

  const selected = articles.find((a) => a.id === selectedId) || null;

  const copyExtract = async () => {
    if (!selected) return;
    const text =
      `Статья ${selected.article_number} «${selected.fullName}»` +
      (selected.category ? `\nРаздел: ${selected.category}` : "") +
      (selected.summary ? `\n\n${selected.summary}` : "") +
      `\n\nИсточник: Расписание болезней (Постановление Правительства РФ № 565).`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard недоступен — игнорируем */
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch("");
          setSelectedId(null);
        }
      }}
    >
      <SheetTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-2" />
            Расписание болезней
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="border-b px-4 py-4 flex-shrink-0 sm:px-5">
          <SheetTitle className="font-serif text-lg flex items-center gap-2 sm:text-xl">
            <BookOpen className="h-5 w-5 flex-shrink-0 text-gold-deep" />
            Расписание болезней
          </SheetTitle>
          <SheetDescription className="text-xs">
            Постановление Правительства РФ № 565 — официальные статьи и категории годности
            (с учётом действующих изменений). Деталь статьи — таблица «пункт → категория по графам».
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b flex-shrink-0 sm:px-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по статье, диагнозу, ключевому слову..."
              className="pl-9 h-10"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {articles.length > 0 && (
            <p className="text-[11px] text-muted-foreground font-mono mt-2 tracking-wide">
              {articles.length} статей · {categories.length} разделов · показано {filtered.length}
            </p>
          )}
        </div>

        {/* Content: split list + detail (на мобайле — один экран за раз) */}
        <div className="flex-1 grid grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* List */}
          <div className={cn("min-h-0 overflow-y-auto border-r", selected && "hidden md:block")}>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <FileSearch className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {search ? "Ничего не найдено по запросу" : "Справочник пуст"}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => setSelectedId(a.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                          active
                            ? "bg-gold/10 border-l-2 border-gold"
                            : "hover:bg-muted/50 border-l-2 border-transparent",
                        )}
                      >
                        <div className="flex-shrink-0 font-mono text-[11px] tracking-wider text-gold-deep font-semibold pt-0.5">
                          ст. {a.article_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm leading-tight line-clamp-2">{a.shortName}</p>
                          {a.category && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{a.category}</p>
                          )}
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 flex-shrink-0 mt-0.5",
                            active ? "text-gold-deep" : "text-muted-foreground/40",
                          )}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className={cn("min-h-0 overflow-y-auto bg-paper-deep/20", !selected && "hidden md:block")}>
            {!selected ? (
              <div className="p-8 text-center h-full flex flex-col items-center justify-center">
                <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="font-serif text-base text-ink mb-1">Выберите статью слева</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Откроется официальное название, таблица категорий годности по графам и краткая сводка.
                </p>
              </div>
            ) : (
              <article className="p-4 sm:p-5">
                <button
                  onClick={() => setSelectedId(null)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground md:hidden"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  К списку статей
                </button>

                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-gold-deep mb-2">
                  Статья {selected.article_number}
                  {selected.category && <> · {selected.category}</>}
                </div>
                <h3 className="font-serif text-lg sm:text-xl text-ink leading-snug mb-2 break-words">
                  {selected.fullName}
                </h3>

                {selected.summary && (
                  <div className="rounded-lg border bg-background/60 p-3 text-sm text-ink-soft leading-relaxed whitespace-pre-line break-words">
                    {selected.summary}
                  </div>
                )}

                {/* Официальная таблица категорий годности по графам */}
                <RbArticleView body={selected.body} />

                <div className="mt-6 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to={`/diagnoses/${encodeURIComponent(selected.article_number)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Открыть страницу
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyExtract}>
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Скопировать выписку
                      </>
                    )}
                  </Button>
                </div>
              </article>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DiseaseScheduleDrawer;
