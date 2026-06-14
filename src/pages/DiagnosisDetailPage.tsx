import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LeadMagnetBox, { LEAD_MAGNETS } from "@/components/LeadMagnetBox";
import SEOHead from "@/components/SEOHead";
import { diagnosisSeo } from "@/lib/seoMeta";
import { getDiagnosisGuide } from "@/content/diagnosisGuides";
import DiagnosisGuideView from "@/components/DiagnosisGuideView";
import { ArrowRight, Phone, Loader2, Bot, FileSearch } from "lucide-react";

interface Diagnosis {
  id: string;
  title: string;
  description: string;
  article_number: string;
  category: string | null;
}

const DiagnosisDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [related, setRelated] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const decoded = decodeURIComponent(slug);
    (async () => {
      setLoading(true);
      setNotFound(false);
      // Try exact match first, then case-insensitive
      const { data: exact } = await supabase
        .from("diagnoses")
        .select("*")
        .eq("article_number", decoded)
        .maybeSingle();
      const found =
        exact ||
        (
          await supabase
            .from("diagnoses")
            .select("*")
            .ilike("article_number", decoded)
            .maybeSingle()
        ).data;

      if (cancelled) return;

      if (!found) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setDiagnosis(found as Diagnosis);

      // Related: same category
      if ((found as Diagnosis).category) {
        const { data: rel } = await supabase
          .from("diagnoses")
          .select("*")
          .eq("category", (found as Diagnosis).category)
          .neq("id", (found as Diagnosis).id)
          .limit(4);
        if (!cancelled) setRelated((rel ?? []) as Diagnosis[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleCall = () => {
    window.location.href = "tel:+79253500533";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </div>
    );
  }

  if (notFound || !diagnosis) {
    return (
      <div className="min-h-screen bg-background">
        <SEOHead
          title="Диагноз не найден | Александра Важанина — юрист"
          description="К сожалению, такого диагноза в нашем справочнике нет. Посмотрите полный список или задайте вопрос юристу."
        />
        <Header />
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="font-serif text-3xl text-ink mb-3">Диагноз не найден</h1>
            <p className="text-ink-soft mb-6">
              Возможно, вы перешли по устаревшей ссылке. Вернитесь к полному справочнику.
            </p>
            <Link
              to="/diagnoses"
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              К справочнику диагнозов
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Мета — из общего билдера (тот же, что в prerender, чтобы исходный HTML и
  // <head> после загрузки JS совпадали байт-в-байт). См. src/lib/seoMeta.ts.
  const guide = getDiagnosisGuide(diagnosis.article_number);
  const seo = diagnosisSeo(diagnosis, guide);
  const pageTitle = seo.title;
  const pageDescription = seo.description;
  const keywords = seo.keywords;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={pageTitle}
        description={pageDescription}
        keywords={keywords}
        breadcrumbs={[
          { name: "Диагнозы", url: "https://nepriziv.ru/diagnoses" },
          { name: diagnosis.title, url: `https://nepriziv.ru/diagnoses/${diagnosis.article_number}` },
        ]}
      />
      <Header />

      {/* Schema.org MedicalCondition */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalCondition",
            name: diagnosis.title,
            description: diagnosis.description,
            code: {
              "@type": "MedicalCode",
              codingSystem: "Расписание болезней (Постановление №565)",
              codeValue: diagnosis.article_number,
            },
          }),
        }}
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 pb-24 md:pb-16">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="font-mono text-[10px] tracking-[0.25em] uppercase text-ink/60 mb-6 flex items-center gap-2">
            <Link to="/" className="hover:text-gold transition-colors">Главная</Link>
            <span className="text-ink/30">/</span>
            <Link to="/diagnoses" className="hover:text-gold transition-colors">Диагнозы</Link>
            <span className="text-ink/30">/</span>
            <span className="text-ink truncate">{diagnosis.article_number}</span>
          </nav>

          {/* Title block */}
          <header className="border-b border-ink/15 pb-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-xs tracking-[0.2em] text-gold uppercase">
                Статья {diagnosis.article_number}
              </span>
              {diagnosis.category && (
                <>
                  <span className="text-ink/20">·</span>
                  <span className="font-mono text-xs tracking-[0.2em] text-ink/60 uppercase">
                    {diagnosis.category}
                  </span>
                </>
              )}
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
              {diagnosis.title}
            </h1>
          </header>

          {/* Description */}
          <article className="prose prose-ink max-w-none mb-10">
            <p className="text-base sm:text-lg text-ink-soft leading-relaxed whitespace-pre-line">
              {diagnosis.description}
            </p>
          </article>

          {/* Расширенные SEO-блоки для топовых статей (если есть гайд) */}
          {guide && <DiagnosisGuideView guide={guide} />}

          {/* Lead magnet — матрица «диагноз → статья 565», максимально по теме страницы */}
          <section className="mb-10">
            <LeadMagnetBox magnet={LEAD_MAGNETS.matrix_565} variant="inline" />
          </section>

          {/* Action block */}
          <section className="border-y border-ink/15 py-8 my-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              to="/dashboard/medical-documents"
              className="group flex flex-col p-5 border border-ink/20 hover:border-gold hover:bg-gold/5 transition-colors"
            >
              <Bot className="h-5 w-5 text-gold mb-3" />
              <h3 className="font-serif text-lg text-ink mb-1">
                Проверить ИИ-помощником
              </h3>
              <p className="text-sm text-ink-soft mb-3 flex-1">
                Загрузите медицинские документы — ИИ оценит, попадаете ли вы под эту статью.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep inline-flex items-center gap-1">
                Бесплатно <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
            <button
              onClick={handleCall}
              className="group flex flex-col text-left p-5 bg-ink text-paper hover:bg-gold hover:text-ink transition-colors"
            >
              <Phone className="h-5 w-5 text-gold group-hover:text-ink mb-3" />
              <h3 className="font-serif text-lg mb-1">
                Спросить юриста
              </h3>
              <p className="text-sm opacity-80 mb-3 flex-1">
                Александра разберёт вашу ситуацию по этой статье на вводной консультации.
              </p>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1">
                Бесплатная вводная <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          </section>

          {/* Disclaimer */}
          <aside className="border-l-2 border-gold/40 pl-4 py-2 mb-10">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep mb-1">
              Важно
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Информация носит справочный характер. Окончательное решение по категории годности
              принимает призывная комиссия на основании военно-врачебной экспертизы.
              Для оценки вашей конкретной ситуации запишитесь на бесплатную вводную консультацию.
            </p>
          </aside>

          {/* Related diagnoses */}
          {related.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                  Похожие диагнозы
                </span>
                <span className="h-px flex-1 bg-ink/15" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to={`/diagnoses/${encodeURIComponent(r.article_number)}`}
                    className="group flex items-start gap-3 p-4 border border-ink/15 hover:border-gold transition-colors"
                  >
                    <FileSearch className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-serif text-base text-ink leading-tight">
                        {r.title}
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mt-1">
                        Статья {r.article_number}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DiagnosisDetailPage;
