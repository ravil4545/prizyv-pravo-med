import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpRight, FileSearch } from "lucide-react";

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
  const [filteredDiagnoses, setFilteredDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDiagnoses();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const filtered = diagnoses.filter(
        (d) =>
          d.title.toLowerCase().includes(term) ||
          d.description.toLowerCase().includes(term) ||
          d.article_number.toLowerCase().includes(term) ||
          (d.category ?? "").toLowerCase().includes(term),
      );
      setFilteredDiagnoses(filtered);
    } else {
      setFilteredDiagnoses(diagnoses);
    }
  }, [searchTerm, diagnoses]);

  const loadDiagnoses = async () => {
    const { data, error } = await supabase
      .from("diagnoses")
      .select("*")
      .order("article_number");

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить диагнозы",
        variant: "destructive",
      });
    } else {
      setDiagnoses(data || []);
      setFilteredDiagnoses(data || []);
    }
    setLoading(false);
  };

  // Group by category for editorial layout
  const grouped = filteredDiagnoses.reduce<Record<string, Diagnosis[]>>((acc, d) => {
    const cat = d.category || "Прочее";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

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
          <div className="relative max-w-xl mb-10">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 w-4 h-4" />
            <Input
              type="text"
              placeholder="Поиск по диагнозу, статье или категории…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-ink/20 focus-visible:ring-gold"
            />
          </div>

          {loading ? (
            <p className="text-ink-soft font-mono text-sm">Загрузка справочника…</p>
          ) : filteredDiagnoses.length === 0 ? (
            <div className="text-center py-16 border border-ink/10 bg-paper-deep/40">
              <FileSearch className="h-8 w-8 text-ink/30 mx-auto mb-3" />
              <p className="text-ink-soft">Диагнозы не найдены</p>
              <p className="text-xs text-ink/50 mt-1">Попробуйте другой запрос</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <section key={category} className="mb-12">
                <div className="flex items-center gap-3 mb-5">
                  <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                    {category}
                  </span>
                  <span className="h-px flex-1 bg-ink/10" />
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/50">
                    {items.length} ст.
                  </span>
                </div>

                <ul className="border-y border-ink/15">
                  {items.map((d) => (
                    <li key={d.id} className="border-b border-ink/10 last:border-0">
                      <Link
                        to={`/diagnoses/${encodeURIComponent(d.article_number)}`}
                        className="group grid grid-cols-[5rem_1fr_2rem] sm:grid-cols-[7rem_1fr_3rem] gap-4 py-4 items-center hover:bg-paper-deep/40 transition-colors"
                      >
                        <div className="font-mono text-xs sm:text-sm text-gold-deep">
                          ст. {d.article_number}
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-serif text-base sm:text-lg text-ink leading-tight">
                            {d.title}
                          </h2>
                          <p className="text-xs sm:text-sm text-ink-soft line-clamp-1 mt-1">
                            {d.description}
                          </p>
                        </div>
                        <div className="flex justify-end">
                          <span className="flex h-8 w-8 items-center justify-center border border-ink/20 text-ink/40 group-hover:border-gold group-hover:text-gold transition-colors">
                            <ArrowUpRight className="h-4 w-4" />
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DiagnosesPage;
