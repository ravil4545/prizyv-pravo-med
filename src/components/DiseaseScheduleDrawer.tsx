import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Search, ExternalLink, ChevronRight, FileSearch, X } from "lucide-react";
import { Link } from "react-router-dom";

interface Diagnosis {
  id: string;
  title: string;
  description: string;
  article_number: string;
  category: string | null;
}

interface DiseaseScheduleDrawerProps {
  /** Triggering element. If omitted — renders default button. */
  children?: React.ReactNode;
}

/**
 * Расписание болезней (Постановление №565) внутри кабинета юриста.
 * Выезжает справа панелью, без ухода с текущей страницы.
 * Юрист может прямо во время разговора с клиентом найти статью и взять выписку.
 */
const DiseaseScheduleDrawer = ({ children }: DiseaseScheduleDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Ленивая загрузка — только при первом открытии
  useEffect(() => {
    if (!open || loadedOnce) return;
    setLoading(true);
    supabase
      .from("diagnoses")
      .select("id, title, description, article_number, category")
      .order("article_number")
      .then(({ data }) => {
        setDiagnoses((data || []) as Diagnosis[]);
        setLoading(false);
        setLoadedOnce(true);
      });
  }, [open, loadedOnce]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    diagnoses.forEach((d) => d.category && set.add(d.category));
    return Array.from(set).sort();
  }, [diagnoses]);

  const filtered = useMemo(() => {
    if (!search.trim()) return diagnoses;
    const q = search.toLowerCase();
    return diagnoses.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.article_number.toLowerCase().includes(q) ||
        (d.category || "").toLowerCase().includes(q),
    );
  }, [diagnoses, search]);

  const selected = diagnoses.find((d) => d.id === selectedId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-2" />
            Расписание болезней
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl p-0 flex flex-col"
      >
        <SheetHeader className="border-b px-5 py-4 flex-shrink-0">
          <SheetTitle className="font-serif text-xl flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold-deep" />
            Расписание болезней
          </SheetTitle>
          <SheetDescription className="text-xs">
            Постановление Правительства РФ № 565 — справочник статей и категорий годности.
            Не уходит со страницы — продолжайте работу в кабинете.
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="px-5 py-3 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по статье, диагнозу, ключевому слову..."
              className="pl-9 h-10"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {categories.length > 0 && (
            <p className="text-[11px] text-muted-foreground font-mono mt-2 tracking-wide">
              {diagnoses.length} статей · {categories.length} категорий · показано {filtered.length}
            </p>
          )}
        </div>

        {/* Content: split list + detail */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          {/* List */}
          <div className="overflow-y-auto border-r">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <FileSearch className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {search ? "Ничего не найдено по запросу" : "Список диагнозов пуст"}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((d) => {
                  const active = d.id === selectedId;
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
                          active ? "bg-gold/10 border-l-2 border-gold" : "hover:bg-muted/50 border-l-2 border-transparent"
                        }`}
                      >
                        <div className="flex-shrink-0">
                          <div className="font-mono text-[11px] tracking-wider text-gold-deep font-semibold">
                            ст. {d.article_number}
                          </div>
                          {d.category && (
                            <div className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase mt-0.5">
                              {d.category}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm leading-tight line-clamp-2">{d.title}</p>
                        </div>
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 mt-0.5 ${active ? "text-gold-deep" : "text-muted-foreground/40"}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="overflow-y-auto bg-paper-deep/20">
            {!selected ? (
              <div className="p-8 text-center h-full flex flex-col items-center justify-center">
                <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="font-serif text-base text-ink mb-1">Выберите статью слева</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Здесь появится полное описание основания для освобождения, ограничения и
                  ссылка на детальную страницу диагноза.
                </p>
              </div>
            ) : (
              <article className="p-5">
                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold-deep mb-2">
                  Статья {selected.article_number}
                  {selected.category && <> · Категория {selected.category}</>}
                </div>
                <h3 className="font-serif text-xl text-ink leading-tight mb-4">{selected.title}</h3>
                <div className="prose prose-sm max-w-none text-ink-soft whitespace-pre-line leading-relaxed">
                  {selected.description}
                </div>

                <div className="mt-6 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link
                      to={`/diagnoses/${encodeURIComponent(selected.article_number)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Открыть в новой вкладке
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={async () => {
                      const text = `Статья ${selected.article_number}${selected.category ? ` (категория ${selected.category})` : ""}: ${selected.title}\n\n${selected.description}`;
                      try {
                        await navigator.clipboard.writeText(text);
                      } catch {}
                    }}
                  >
                    Скопировать выписку
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
