import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  FileText,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  BookOpen,
  Info,
} from "lucide-react";
import { differenceInMonths } from "date-fns";
import { cn } from "@/lib/utils";

interface ArticleAggregate {
  article_id: string;
  article_number: string;
  article_title: string;
  best_chance: number;
  doc_count: number;
}

interface CaseSummaryData {
  loading: boolean;
  docCount: number;
  analyzedCount: number;
  bestArticle: ArticleAggregate | null;
  topArticles: ArticleAggregate[];
  recommendations: string[];
  staleDocs: number;
  hasQuestionnaire: boolean;
}

const EMPTY: CaseSummaryData = {
  loading: true,
  docCount: 0,
  analyzedCount: 0,
  bestArticle: null,
  topArticles: [],
  recommendations: [],
  staleDocs: 0,
  hasQuestionnaire: false,
};

/**
 * AI-сводка «Где я сейчас» — главный блок дашборда.
 * Агрегирует данные из medical_documents_v2 + document_article_links
 * и показывает силу документальных подтверждений, рекомендации и быстрые действия.
 */
export default function AICaseSummary() {
  const [data, setData] = useState<CaseSummaryData>(EMPTY);
  const [showJournal, setShowJournal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || session.user.is_anonymous) {
          if (!cancelled) setData({ ...EMPTY, loading: false });
          return;
        }

        const [docsRes, linksRes] = await Promise.all([
          supabase
            .from("medical_documents_v2")
            .select("id, document_date, ai_fitness_category, meta")
            .eq("user_id", session.user.id),
          supabase
            .from("document_article_links")
            .select(
              "document_id, article_id, ai_category_chance, ai_recommendations, disease_articles_565(article_number, title)",
            ),
        ]);

        const docs = docsRes.data || [];
        const links = linksRes.data || [];

        const now = new Date();
        const staleDocs = docs.filter(
          (d) => d.document_date && differenceInMonths(now, new Date(d.document_date)) > 6,
        ).length;

        const analyzedCount = docs.filter((d) => d.ai_fitness_category).length;
        const hasQuestionnaire = docs.some(
          (d) => (d.meta as Record<string, unknown> | null)?.is_questionnaire === true,
        );

        // Aggregate the strongest document-evidence score per article.
        const articleMap = new Map<string, ArticleAggregate>();
        const recsSet = new Set<string>();

        for (const link of links) {
          const article = (link as { disease_articles_565?: { article_number: string; title: string } | null })
            .disease_articles_565;
          if (!article || !link.article_id) continue;
          const chance = link.ai_category_chance || 0;
          const existing = articleMap.get(link.article_id);
          if (!existing) {
            articleMap.set(link.article_id, {
              article_id: link.article_id,
              article_number: article.article_number,
              article_title: article.title,
              best_chance: chance,
              doc_count: 1,
            });
          } else {
            if (chance > existing.best_chance) existing.best_chance = chance;
            existing.doc_count += 1;
          }
          (link.ai_recommendations || []).forEach((r: string) => recsSet.add(r));
        }

        const topArticles = [...articleMap.values()]
          .sort((a, b) => b.best_chance - a.best_chance)
          .slice(0, 3);

        if (cancelled) return;
        setData({
          loading: false,
          docCount: docs.length,
          analyzedCount,
          bestArticle: topArticles[0] || null,
          topArticles,
          recommendations: [...recsSet].slice(0, 4),
          staleDocs,
          hasQuestionnaire,
        });
      } catch (err) {
        console.error("AICaseSummary load error", err);
        if (!cancelled) setData({ ...EMPTY, loading: false });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (data.loading) {
    return (
      <Card className="border-gold/30 bg-gradient-to-br from-paper to-paper-deep/30">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  // Эмпти-стейт: нет документов
  if (data.docCount === 0) {
    return (
      <Card className="border-gold/30 bg-gradient-to-br from-paper to-paper-deep/30">
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gold/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-6 w-6 text-gold-deep" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-serif text-xl md:text-2xl text-foreground mb-1">
                Начните формирование досье
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Загрузите 2–3 медицинских документа — ИИ извлечёт диагнозы, привяжет к статьям
                Расписания болезней № 565 и покажет, каким статьям они соответствуют и каких документов не хватает.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-gold-deep hover:bg-gold-deep/90 text-paper"
                  onClick={() => navigate("/dashboard/medical-documents")}
                >
                  <FileText className="h-4 w-4 mr-1.5" />
                  Загрузить документы
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/medical-questionnaire")}
                >
                  Пройти опросник
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const best = data.bestArticle;
  const evidenceScore = best?.best_chance || 0;
  const evidenceColor =
    evidenceScore >= 60 ? "text-emerald-700" : evidenceScore >= 30 ? "text-gold-deep" : "text-muted-foreground";

  return (
    <Card className="border-gold/40 bg-gradient-to-br from-paper via-card to-paper-deep/20 overflow-hidden">
      <CardContent className="p-5 md:p-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-deep" />
            <span className="section-number">AI · Сводка по делу</span>
          </div>
          <button
            onClick={() => setShowJournal(!showJournal)}
            className="text-xs text-muted-foreground hover:text-gold-deep transition-colors flex items-center gap-1"
          >
            <Info className="h-3.5 w-3.5" />
            {showJournal ? "Скрыть" : "На чём основано"}
          </button>
        </div>

        {/* Главная цифра */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="md:col-span-1">
            <div className={cn("text-4xl md:text-5xl font-serif font-bold", evidenceColor)}>
              {evidenceScore}
              <span className="text-xl md:text-2xl">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              сила документальных подтверждений по&nbsp;лучшей статье
            </p>
            {best && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Это не вероятность решения призывной комиссии.
              </p>
            )}
          </div>

          <div className="md:col-span-2 space-y-2">
            {best ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  Ст. <span className="font-serif">{best.article_number}</span>{" "}
                  <span className="text-muted-foreground font-normal">— {best.article_title}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Опирается на {best.doc_count}{" "}
                  {best.doc_count === 1 ? "документ" : best.doc_count < 5 ? "документа" : "документов"}
                  {data.analyzedCount > 0 && ` · всего проанализировано ${data.analyzedCount} из ${data.docCount}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Документы загружены, но ИИ-анализ ещё не завершён или не нашёл соответствий
                в Расписании болезней.
              </p>
            )}
          </div>
        </div>

        {/* Топ-3 статей */}
        {data.topArticles.length > 1 && (
          <div className="mb-4 pb-4 border-b border-border/50">
            <p className="text-xs text-muted-foreground mb-2">Альтернативные кандидаты:</p>
            <div className="flex flex-wrap gap-2">
              {data.topArticles.slice(1).map((a) => (
                <button
                  key={a.article_id}
                  onClick={() => navigate("/medical-history")}
                  className="text-xs px-2.5 py-1 rounded-md bg-muted/50 hover:bg-muted text-foreground transition-colors flex items-center gap-1.5"
                >
                  <BookOpen className="h-3 w-3 text-gold-deep" />
                  Ст. {a.article_number} · {a.best_chance}/100
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Алерты */}
        {(data.staleDocs > 0 || !data.hasQuestionnaire || data.analyzedCount < data.docCount) && (
          <div className="space-y-1.5 mb-4">
            {data.staleDocs > 0 && (
              <div className="flex items-center gap-2 text-xs text-seal">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {data.staleDocs}{" "}
                  {data.staleDocs === 1 ? "документ старше" : "документов старше"} 6 месяцев — обновите обследование
                </span>
              </div>
            )}
            {!data.hasQuestionnaire && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Заполните{" "}
                  <button
                    onClick={() => navigate("/medical-questionnaire")}
                    className="underline hover:text-gold-deep"
                  >
                    медицинский опросник
                  </button>{" "}
                  — ИИ учтёт жалобы, которые не отражены в справках
                </span>
              </div>
            )}
            {data.analyzedCount < data.docCount && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {data.docCount - data.analyzedCount} документов ждут анализа
                </span>
              </div>
            )}
          </div>
        )}

        {/* Журнал AI-решений (раскрывается) */}
        {showJournal && (
          <div className="mb-4 p-3 rounded-lg bg-paper-deep/40 border border-gold/20 text-xs text-ink-soft space-y-2">
            <p className="font-semibold text-foreground">Как ИИ получил эту оценку:</p>
            <ul className="space-y-1 list-disc pl-4">
              <li>Загружено {data.docCount} документов, проанализировано — {data.analyzedCount}.</li>
              <li>
                Найдено соответствий статьям РБ-565: {data.topArticles.length}
                {data.topArticles.length > 0 && ` (Ст. ${data.topArticles.map((a) => a.article_number).join(", ")})`}.
              </li>
              <li>
                По каждому документу ИИ извлекает диагноз и сравнивает его с критериями статьи.
                Показан наиболее сильный документальный результат, а не математическая вероятность исхода.
              </li>
              <li>Оценка не подтверждает готовность дела и не является юридическим заключением.</li>
            </ul>
          </div>
        )}

        {/* Рекомендации */}
        {data.recommendations.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-foreground mb-1.5">Следующие шаги:</p>
            <ul className="space-y-1">
              {data.recommendations.map((r, i) => (
                <li key={i} className="text-xs text-ink-soft flex items-start gap-1.5">
                  <ChevronRight className="h-3 w-3 text-gold-deep flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-ink hover:bg-ink/90 text-paper"
            onClick={() => navigate("/dashboard/ai-chat")}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Спросить ИИ
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-gold/40 hover:bg-gold/5"
            onClick={() => navigate("/dashboard/medical-documents")}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Документы
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
