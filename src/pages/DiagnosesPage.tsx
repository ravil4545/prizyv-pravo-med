import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpRight, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_DISPLAY_ORDER,
  categoryInfo,
  compareArticleNumbers,
  type FitnessCategory,
} from "@/lib/fitnessCategories";

interface Diagnosis {
  id: string;
  title: string;
  description: string;
  article_number: string;
  category: string;
}

const DiagnosesPage = () => {
  const { toast } = useToast();
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<FitnessCategory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const loadDiagnoses = async () => {
    const { data, error } = await supabase.from("diagnoses").select("*");

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить диагнозы",
        variant: "destructive",
      });
    } else {
      // В БД article_number — text, поэтому серверный .order() давал
      // 1, 10, 11, …, 2, 20 (статья 2 после статьи 19). Сортируем численно.
      setDiagnoses([...(data || [])].sort((a, b) => compareArticleNumbers(a.article_number, b.article_number)));
    }
    setLoading(false);
  };

  /** Сколько статей приходится на каждую категорию годности — для подписей чипов. */
  const countsByCategory = useMemo(() => {
    const acc: Partial<Record<FitnessCategory, number>> = {};
    for (const d of diagnoses) {
      const info = categoryInfo(d.category);
      if (info) acc[info.code] = (acc[info.code] ?? 0) + 1;
    }
    return acc;
  }, [diagnoses]);

  const availableCategories = useMemo(
    () => CATEGORY_DISPLAY_ORDER.filter((c) => (countsByCategory[c] ?? 0) > 0),
    [countsByCategory],
  );

  const filteredDiagnoses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return diagnoses.filter((d) => {
      if (activeCategory && d.category !== activeCategory) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term) ||
        d.article_number.toLowerCase().includes(term) ||
        (d.category ?? "").toLowerCase().includes(term)
      );
    });
  }, [diagnoses, searchTerm, activeCategory]);

  // Группировка по категории годности в осмысленном порядке: сначала то,
  // что освобождает от призыва (В, Д), затем отсрочка (Г), затем остальное.
  const groups = useMemo(() => {
    const byCat = new Map<string, Diagnosis[]>();
    for (const d of filteredDiagnoses) {
      const key = d.category || "Прочее";
      const list = byCat.get(key);
      if (list) list.push(d);
      else byCat.set(key, [d]);
    }
    const ordered: Array<[string, Diagnosis[]]> = [];
    for (const c of CATEGORY_DISPLAY_ORDER) {
      const list = byCat.get(c);
      if (list) {
        ordered.push([c, list]);
        byCat.delete(c);
      }
    }
    for (const [k, v] of byCat) ordered.push([k, v]);
    return ordered;
  }, [filteredDiagnoses]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Справочник диагнозов и статей Расписания болезней | Юрист Важанина"
        description="Полный справочник 88 статей Расписания болезней (Постановление №565) с разъяснениями. Подберите подходящую статью для освобождения от призыва."
        keywords="расписание болезней, статьи 565, непризывные диагнозы, отсрочка от армии, освобождение, категория В, военно-врачебная экспертиза"
      />
      <Header />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 pb-24 md:pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 07</span>
            <span className="h-px flex-1 bg-ink/15 max-w-[80px]" />
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
              Справочник
            </span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-ink leading-[1.05] mb-4">
            Расписание болезней
            <span className="block italic text-gold font-light text-2xl sm:text-3xl md:text-4xl mt-2">
              88 статей · разъяснения юриста
            </span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-ink-soft leading-relaxed mb-10">
            Справочник статей Постановления №565 — основа для оценки категории годности
            призывника. Кликните на статью, чтобы увидеть критерии и записаться на консультацию.
          </p>

          {/* Search */}
          <div className="relative max-w-xl mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 w-4 h-4" />
            <Input
              type="text"
              placeholder="Поиск по диагнозу, статье или категории…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-ink/20 focus-visible:ring-gold"
            />
          </div>

          {/* Фильтр по категории годности. Раньше фильтров не было вообще —
              человек с конкретной жалобой листал 88 одинаковых строк. */}
          {!loading && availableCategories.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "px-3 py-1.5 border font-mono text-[11px] tracking-[0.15em] uppercase transition-colors",
                  activeCategory === null
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/20 text-ink-soft hover:border-gold hover:text-gold-deep",
                )}
              >
                Все · {diagnoses.length}
              </button>
              {availableCategories.map((code) => {
                const info = categoryInfo(code)!;
                const active = activeCategory === code;
                return (
                  <button
                    key={code}
                    onClick={() => setActiveCategory(active ? null : code)}
                    title={info.meaning}
                    className={cn(
                      "px-3 py-1.5 border font-mono text-[11px] tracking-[0.15em] uppercase transition-colors",
                      active
                        ? "border-ink bg-ink text-paper"
                        : cn(info.badgeClass, "hover:border-gold hover:text-gold-deep"),
                    )}
                  >
                    {code} · {info.short} · {countsByCategory[code]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Легенда: буква сама по себе человеку ничего не говорит. */}
          {!loading && (
            <p className="mb-10 max-w-2xl text-xs sm:text-sm text-ink-soft leading-relaxed">
              {activeCategory
                ? categoryInfo(activeCategory)?.meaning
                : "Буква — категория годности по итогам освидетельствования: В и Д освобождают от призыва, Г даёт отсрочку на лечение, Б означает призыв с ограничениями по роду войск."}
            </p>
          )}

          {loading ? (
            <p className="text-ink-soft font-mono text-sm">Загрузка справочника…</p>
          ) : filteredDiagnoses.length === 0 ? (
            <div className="text-center py-16 border border-ink/10 bg-paper-deep/40">
              <FileSearch className="h-8 w-8 text-ink/30 mx-auto mb-3" />
              <p className="text-ink-soft">Диагнозы не найдены</p>
              <p className="text-xs text-ink/50 mt-1">Попробуйте другой запрос</p>
            </div>
          ) : (
            groups.map(([category, items]) => {
              const info = categoryInfo(category);
              return (
                <section key={category} className="mb-12">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                      {info ? `Категория ${info.code} · ${info.short}` : category}
                    </span>
                    <span className="h-px flex-1 bg-ink/10" />
                    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
                      {items.length} ст.
                    </span>
                  </div>

                  <ul className="border-y border-ink/15">
                    {items.map((d) => {
                      const rowInfo = categoryInfo(d.category);
                      return (
                        <li key={d.id} className="border-b border-ink/10 last:border-0">
                          <Link
                            to={`/diagnoses/${encodeURIComponent(d.article_number)}`}
                            className="group grid grid-cols-[4.5rem_1fr_2rem] sm:grid-cols-[7rem_1fr_3rem] gap-3 sm:gap-4 py-4 items-start hover:bg-paper-deep/40 transition-colors"
                          >
                            <div className="pt-0.5">
                              <div className="font-mono text-xs sm:text-sm text-gold-deep">
                                ст. {d.article_number}
                              </div>
                              {/* Бейдж категории годности — раньше на карточке не было
                                  ничего, что помогло бы выбрать без клика. */}
                              {rowInfo && (
                                <span
                                  className={cn(
                                    "mt-1.5 inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.15em]",
                                    rowInfo.badgeClass,
                                  )}
                                >
                                  {rowInfo.code}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h2 className="font-serif text-base sm:text-lg text-ink leading-tight">
                                {d.title}
                              </h2>
                              <p className="text-xs sm:text-sm text-ink-soft line-clamp-2 mt-1">
                                {d.description}
                              </p>
                            </div>
                            <div className="flex justify-end pt-0.5">
                              <span className="flex h-8 w-8 items-center justify-center border border-ink/20 text-ink/40 group-hover:border-gold group-hover:text-gold transition-colors">
                                <ArrowUpRight className="h-4 w-4" />
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DiagnosesPage;
