import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, ChevronRight, BookOpen, FileCheck, Search, AlertCircle, CheckCircle2, ClipboardList, Download, Printer, Pencil, Check, Stethoscope, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { getSignedDocumentUrl } from "@/lib/storage";
import { toast } from "sonner";

interface Article {
  id: string;
  article_number: string;
  title: string;
  body: string;
  category: string;
  is_active: boolean;
}

interface UserDocument {
  id: string;
  title: string;
  file_url: string;
  uploaded_at: string;
  raw_text: string | null;
  document_type_id: string | null;
  meta: any;
  ai_recommendations: string[] | null;
  ai_fitness_category: string | null;
  ai_category_chance: number | null;
  ai_explanation: string | null;
  linked_article_id: string | null;
}

interface DocumentArticleLink {
  id: string;
  document_id: string;
  article_id: string;
  ai_fitness_category: string | null;
  ai_category_chance: number | null;
  ai_recommendations: string[] | null;
  ai_explanation: string | null;
}

interface ArticleAssessment {
  article_id: string;
  score_v: number;
}

const categoryColors: Record<string, string> = {
  infections: "#ef4444",
  tumors: "#dc2626",
  blood: "#b91c1c",
  endocrine: "#10b981",
  mental: "#8b5cf6",
  nervous_system: "#6366f1",
  eyes: "#3b82f6",
  ears: "#0ea5e9",
  cardiology: "#f43f5e",
  respiratory: "#14b8a6",
  digestive: "#f59e0b",
  skin: "#d97706",
  musculoskeletal: "#84cc16",
  urogenital: "#06b6d4",
  pregnancy: "#ec4899",
  trauma: "#78716c",
};

const categoryLabels: Record<string, string> = {
  infections: "Инфекции",
  tumors: "Новообразования",
  blood: "Болезни крови",
  endocrine: "Эндокринология",
  mental: "Психиатрия",
  nervous_system: "Нервная система",
  eyes: "Органы зрения",
  ears: "Органы слуха",
  cardiology: "Кровообращение",
  respiratory: "Органы дыхания",
  digestive: "Пищеварение",
  skin: "Кожа",
  musculoskeletal: "Костно-мышечная",
  urogenital: "Мочеполовая",
  pregnancy: "Беременность",
  trauma: "Травмы",
};

// Keywords that suggest a document is relevant to Category B (limited fitness)
const categoryBKeywords: Record<string, string[]> = {
  infections: ["туберкулёз", "туберкулез", "вич", "гепатит", "хронический", "рецидивирующий"],
  tumors: ["новообразование", "опухоль", "рак", "онкология"],
  blood: ["анемия", "гемофилия", "тромбоцитопения", "лейкоз"],
  endocrine: ["диабет", "сахарный", "гипотиреоз", "тиреотоксикоз", "ожирение"],
  mental: ["депрессия", "невроз", "птср", "тревожное", "расстройство личности", "шизофрения"],
  nervous_system: ["эпилепсия", "приступ", "судороги", "энцефалопатия", "невропатия", "рассеянный склероз"],
  eyes: ["миопия", "близорукость", "глаукома", "катаракта", "астигматизм", "слепота"],
  ears: ["тугоухость", "глухота", "отит", "вестибулярный"],
  cardiology: ["гипертония", "давление", "аритмия", "порок сердца", "недостаточность", "стенокардия", "инфаркт"],
  respiratory: ["астма", "бронхиальная", "хобл", "бронхоэктазы", "пневмосклероз"],
  digestive: ["язва", "гастрит", "панкреатит", "гепатит", "цирроз", "болезнь крона"],
  skin: ["псориаз", "экзема", "дерматит", "атопический"],
  musculoskeletal: ["сколиоз", "плоскостопие", "артроз", "артрит", "остеохондроз", "грыжа"],
  urogenital: ["пиелонефрит", "мочекаменная", "почечная недостаточность", "гломерулонефрит"],
  pregnancy: ["беременность"],
  trauma: ["перелом", "травма", "контузия", "чмт"],
};

// Calculate Category B chance based on AI analysis from documents
function calculateCategoryBChance(
  article: Article,
  articleLinks: DocumentArticleLink[],
  assessments: ArticleAssessment[],
): { categoryB: number; categoryA: number; noData: number; hasRelevantDocs: boolean; relevantDocsCount: number } {
  // Check if there's a saved assessment for this article
  const assessment = assessments.find((a) => a.article_id === article.id);
  if (assessment && assessment.score_v !== null) {
    const score = assessment.score_v;
    return {
      categoryB: score,
      categoryA: Math.max(0, 100 - score - 5),
      noData: 5,
      hasRelevantDocs: true,
      relevantDocsCount: articleLinks.length,
    };
  }

  if (articleLinks.length === 0) {
    return {
      categoryB: 0,
      categoryA: 0,
      noData: 100,
      hasRelevantDocs: false,
      relevantDocsCount: 0,
    };
  }

  // Use AI-calculated chances from article links
  const linksWithChance = articleLinks.filter(
    (link) => link.ai_category_chance !== null && link.ai_category_chance > 0,
  );

  if (linksWithChance.length === 0) {
    return {
      categoryB: 0,
      categoryA: 70,
      noData: 30,
      hasRelevantDocs: true,
      relevantDocsCount: articleLinks.length,
    };
  }

  // Take the maximum AI-calculated chance from relevant links
  const maxChance = Math.max(...linksWithChance.map((link) => link.ai_category_chance || 0));

  return {
    categoryB: maxChance,
    categoryA: Math.max(0, 100 - maxChance - 5),
    noData: 5,
    hasRelevantDocs: true,
    relevantDocsCount: articleLinks.length,
  };
}

// Get document article links for a specific article
function getArticleLinks(articleId: string, allLinks: DocumentArticleLink[]): DocumentArticleLink[] {
  return allLinks.filter((link) => link.article_id === articleId);
}

// Get documents for an article using the junction table
function getDocumentsForArticle(
  articleId: string,
  allLinks: DocumentArticleLink[],
  allDocuments: UserDocument[],
): { document: UserDocument; link: DocumentArticleLink }[] {
  const links = allLinks.filter((link) => link.article_id === articleId);
  const result: { document: UserDocument; link: DocumentArticleLink }[] = [];

  for (const link of links) {
    const doc = allDocuments.find((d) => d.id === link.document_id);
    if (doc) {
      result.push({ document: doc, link });
    }
  }

  return result;
}

export default function MedicalHistoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [documentArticleLinks, setDocumentArticleLinks] = useState<DocumentArticleLink[]>([]);
  const [assessments, setAssessments] = useState<ArticleAssessment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditingExams, setIsEditingExams] = useState(false);
  const [editedExamsText, setEditedExamsText] = useState("");
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [isEditingGlobalExams, setIsEditingGlobalExams] = useState(false);
  const [editedGlobalExamsText, setEditedGlobalExamsText] = useState("");
  const [isGeneratingGlobalDoc, setIsGeneratingGlobalDoc] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadArticles();
      loadUserDocuments();
      loadDocumentArticleLinks();
      loadAssessments();
    }
  }, [user]);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      // Allow demo access — don't redirect
      setLoading(false);
      return;
    }
    setUser(session.user);
    setLoading(false);
  };

  const loadArticles = async () => {
    const { data, error } = await supabase
      .from("disease_articles_565")
      .select("*")
      .eq("is_active", true)
      .order("article_number");

    if (!error && data) {
      // Sort by numeric article number initially
      const sorted = data.sort((a, b) => {
        const numA = parseInt(a.article_number);
        const numB = parseInt(b.article_number);
        return numA - numB;
      });
      setArticles(sorted);
      // Don't set selectedArticle here - let the sortedArticles effect handle it
    }
  };

  const loadUserDocuments = async () => {
    const { data, error } = await supabase
      .from("medical_documents_v2")
      .select(
        "id, title, file_url, uploaded_at, raw_text, document_type_id, meta, ai_recommendations, ai_fitness_category, ai_category_chance, ai_explanation, linked_article_id",
      )
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setUserDocuments(data);
    }
  };

  const loadDocumentArticleLinks = async () => {
    // Fetch all document article links for user's documents
    const { data: docs } = await supabase.from("medical_documents_v2").select("id").eq("user_id", user.id);

    if (docs && docs.length > 0) {
      const docIds = docs.map((d) => d.id);
      const { data, error } = await supabase
        .from("document_article_links")
        .select(
          "id, document_id, article_id, ai_fitness_category, ai_category_chance, ai_recommendations, ai_explanation",
        )
        .in("document_id", docIds);

      if (!error && data) {
        setDocumentArticleLinks(data as DocumentArticleLink[]);
      }
    }
  };

  const loadAssessments = async () => {
    const { data, error } = await supabase
      .from("article_user_assessment")
      .select("article_id, score_v")
      .eq("user_id", user.id);

    if (!error && data) {
      setAssessments(data as ArticleAssessment[]);
    }
  };

  // Calculate article scores using junction table
  const articleScores = useMemo(() => {
    const scores: { article: Article; linksCount: number; maxChance: number }[] = [];

    articles.forEach((article) => {
      const links = getArticleLinks(article.id, documentArticleLinks);
      const linksWithChance = links.filter((link) => link.ai_category_chance !== null && link.ai_category_chance > 0);
      const maxChance =
        linksWithChance.length > 0 ? Math.max(...linksWithChance.map((link) => link.ai_category_chance || 0)) : 0;

      scores.push({ article, linksCount: links.length, maxChance });
    });

    return scores;
  }, [articles, documentArticleLinks]);

  // Sort articles by chance (highest first), then by article number
  const sortedArticles = useMemo(() => {
    return [...articleScores].sort((a, b) => {
      // First by chance (descending)
      if (b.maxChance !== a.maxChance) {
        return b.maxChance - a.maxChance;
      }
      // Then by article number (ascending)
      return parseInt(a.article.article_number) - parseInt(b.article.article_number);
    });
  }, [articleScores]);

  // Set initial selected article to the first article by number
  useEffect(() => {
    if (articles.length > 0 && !selectedArticle) {
      // Always select the first article (sorted by article_number)
      setSelectedArticle(articles[0]);
    }
  }, [articles, selectedArticle]);

  // Filter articles by search
  const filteredArticles = useMemo(() => {
    const articlesToFilter = sortedArticles.map((s) => s.article);
    if (!searchQuery.trim()) return articlesToFilter;
    const query = searchQuery.toLowerCase();
    return articlesToFilter.filter(
      (article) =>
        article.article_number.toLowerCase().includes(query) ||
        article.title.toLowerCase().includes(query) ||
        (categoryLabels[article.category] || "").toLowerCase().includes(query),
    );
  }, [sortedArticles, searchQuery]);

  // Group articles by category (preserving sort order within groups)
  const groupedArticles = useMemo(() => {
    const groups: Record<string, Article[]> = {};
    filteredArticles.forEach((article) => {
      const cat = article.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(article);
    });
    return groups;
  }, [filteredArticles]);

  // Get article links for selected article
  const selectedArticleLinks = useMemo(() => {
    if (!selectedArticle) return [];
    return getArticleLinks(selectedArticle.id, documentArticleLinks);
  }, [selectedArticle, documentArticleLinks]);

  // Get documents with their links for selected article
  const documentsWithLinks = useMemo(() => {
    if (!selectedArticle) return [];
    return getDocumentsForArticle(selectedArticle.id, documentArticleLinks, userDocuments);
  }, [selectedArticle, documentArticleLinks, userDocuments]);

  // Calculate chance data for selected article using junction table
  const chanceData = useMemo(() => {
    if (!selectedArticle) return null;
    return calculateCategoryBChance(selectedArticle, selectedArticleLinks, assessments);
  }, [selectedArticle, selectedArticleLinks, assessments]);

  // Smart recommendation summarization
  const summarizedRecommendations = useMemo(() => {
    // Collect all raw recommendations with document dates
    const rawRecommendations: { rec: string; docDate: Date | null; docId: string }[] = [];

    selectedArticleLinks.forEach((link) => {
      const doc = userDocuments.find((d) => d.id === link.document_id);
      const docDate = doc?.uploaded_at ? new Date(doc.uploaded_at) : null;

      if (link.ai_recommendations && Array.isArray(link.ai_recommendations)) {
        link.ai_recommendations.forEach((rec) => {
          rawRecommendations.push({ rec, docDate, docId: link.document_id });
        });
      }
    });

    if (rawRecommendations.length === 0) return [];

    // Define recommendation categories for grouping
    const categoryPatterns = {
      bloodTests: /анализ.*крови|кровь|гемоглобин|лейкоцит|тромбоцит|общий анализ|биохим|оак|бак/i,
      urineTests: /анализ.*мочи|моча|урин/i,
      imaging: /ренг|рентген|мрт|кт|узи|ультразвук|томограф|флюорог|снимок/i,
      ecg: /экг|электрокардио|кардиограм|холтер/i,
      consultation: /консультац|осмотр|прием|врач|специалист|обратиться/i,
      hospitalization: /госпитализ|стационар|выписка|лечение|терапия/i,
      documentation: /документ|справка|заключение|выписк|история болезни/i,
      repeatExam: /повтор|обновить|актуальн|давност/i,
    };

    // Group recommendations by category
    const groupedRecs: Record<string, { recs: string[]; oldestDate: Date | null }> = {
      bloodTests: { recs: [], oldestDate: null },
      urineTests: { recs: [], oldestDate: null },
      imaging: { recs: [], oldestDate: null },
      ecg: { recs: [], oldestDate: null },
      consultation: { recs: [], oldestDate: null },
      hospitalization: { recs: [], oldestDate: null },
      documentation: { recs: [], oldestDate: null },
      repeatExam: { recs: [], oldestDate: null },
      other: { recs: [], oldestDate: null },
    };

    rawRecommendations.forEach(({ rec, docDate }) => {
      let matched = false;
      for (const [category, pattern] of Object.entries(categoryPatterns)) {
        if (pattern.test(rec)) {
          if (
            !groupedRecs[category].recs.some(
              (r) =>
                r.toLowerCase().includes(rec.toLowerCase().slice(0, 30)) ||
                rec.toLowerCase().includes(r.toLowerCase().slice(0, 30)),
            )
          ) {
            groupedRecs[category].recs.push(rec);
          }
          if (docDate && (!groupedRecs[category].oldestDate || docDate < groupedRecs[category].oldestDate)) {
            groupedRecs[category].oldestDate = docDate;
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (
          !groupedRecs.other.recs.some(
            (r) =>
              r.toLowerCase().includes(rec.toLowerCase().slice(0, 30)) ||
              rec.toLowerCase().includes(r.toLowerCase().slice(0, 30)),
          )
        ) {
          groupedRecs.other.recs.push(rec);
        }
        if (docDate && (!groupedRecs.other.oldestDate || docDate < groupedRecs.other.oldestDate)) {
          groupedRecs.other.oldestDate = docDate;
        }
      }
    });

    // Generate summarized recommendations
    const summarized: string[] = [];
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

    // Helper to check if documents are outdated
    const isOutdated = (date: Date | null) => date && date < sixMonthsAgo;
    const monthsOld = (date: Date | null) =>
      date ? Math.floor((now.getTime() - date.getTime()) / (30 * 24 * 60 * 60 * 1000)) : 0;

    // Blood tests
    if (groupedRecs.bloodTests.recs.length > 0) {
      if (isOutdated(groupedRecs.bloodTests.oldestDate)) {
        summarized.push(
          `Обновите анализы крови (последние данные ${monthsOld(groupedRecs.bloodTests.oldestDate)} мес. назад): общий анализ, биохимия, специфические показатели по заболеванию`,
        );
      } else {
        summarized.push("Сдайте анализы крови: общий анализ, биохимия, специфические показатели по заболеванию");
      }
    }

    // Urine tests
    if (groupedRecs.urineTests.recs.length > 0) {
      if (isOutdated(groupedRecs.urineTests.oldestDate)) {
        summarized.push(
          `Обновите анализ мочи (давность ${monthsOld(groupedRecs.urineTests.oldestDate)} мес.): общий + специальные исследования`,
        );
      } else {
        summarized.push("Сдайте анализы мочи: общий анализ и специальные исследования при необходимости");
      }
    }

    // Imaging studies - be specific
    if (groupedRecs.imaging.recs.length > 0) {
      const imagingTypes = [];
      const allImageRecs = groupedRecs.imaging.recs.join(" ").toLowerCase();
      if (/мрт/.test(allImageRecs)) imagingTypes.push("МРТ");
      if (/кт|томограф/.test(allImageRecs)) imagingTypes.push("КТ");
      if (/узи|ультразвук/.test(allImageRecs)) imagingTypes.push("УЗИ");
      if (/рентген|ренг|снимок/.test(allImageRecs)) imagingTypes.push("рентген");
      if (/флюорог/.test(allImageRecs)) imagingTypes.push("флюорография");

      const imagingList = imagingTypes.length > 0 ? imagingTypes.join(", ") : "лучевую диагностику";
      if (isOutdated(groupedRecs.imaging.oldestDate)) {
        summarized.push(
          `Повторите инструментальные исследования (${monthsOld(groupedRecs.imaging.oldestDate)} мес. назад): ${imagingList}`,
        );
      } else {
        summarized.push(`Пройдите инструментальные исследования: ${imagingList}`);
      }
    }

    // ECG
    if (groupedRecs.ecg.recs.length > 0) {
      if (isOutdated(groupedRecs.ecg.oldestDate)) {
        summarized.push(
          `Обновите ЭКГ/кардиологическое обследование (давность ${monthsOld(groupedRecs.ecg.oldestDate)} мес.)`,
        );
      } else {
        summarized.push("Пройдите ЭКГ или кардиологическое обследование");
      }
    }

    // Consultations - extract specific specialists
    if (groupedRecs.consultation.recs.length > 0) {
      const specialists = [];
      const allConsultRecs = groupedRecs.consultation.recs.join(" ").toLowerCase();
      if (/невролог|неврол/.test(allConsultRecs)) specialists.push("невролог");
      if (/кардиолог/.test(allConsultRecs)) specialists.push("кардиолог");
      if (/терапевт/.test(allConsultRecs)) specialists.push("терапевт");
      if (/хирург/.test(allConsultRecs)) specialists.push("хирург");
      if (/ортопед/.test(allConsultRecs)) specialists.push("ортопед");
      if (/офтальмолог|окулист|глаз/.test(allConsultRecs)) specialists.push("офтальмолог");
      if (/лор|отоларинголог/.test(allConsultRecs)) specialists.push("ЛОР");
      if (/психиатр/.test(allConsultRecs)) specialists.push("психиатр");
      if (/дерматолог/.test(allConsultRecs)) specialists.push("дерматолог");
      if (/гастроэнтеролог/.test(allConsultRecs)) specialists.push("гастроэнтеролог");
      if (/эндокринолог/.test(allConsultRecs)) specialists.push("эндокринолог");
      if (/уролог/.test(allConsultRecs)) specialists.push("уролог");
      if (/пульмонолог/.test(allConsultRecs)) specialists.push("пульмонолог");

      const specList = specialists.length > 0 ? specialists.join(", ") : "профильных специалистов";
      summarized.push(`Получите консультации: ${specList}`);
    }

    // Hospitalization
    if (groupedRecs.hospitalization.recs.length > 0) {
      summarized.push(
        "Рассмотрите госпитализацию или стационарное обследование для углублённой диагностики и документирования",
      );
    }

    // Documentation
    if (groupedRecs.documentation.recs.length > 0) {
      summarized.push(
        "Соберите полный пакет медицинской документации: выписки, заключения специалистов, результаты обследований",
      );
    }

    // Other recommendations - keep unique ones that don't fit categories
    groupedRecs.other.recs.slice(0, 3).forEach((rec) => {
      if (!summarized.some((s) => s.toLowerCase().includes(rec.toLowerCase().slice(0, 20)))) {
        summarized.push(rec);
      }
    });

    // Add general recommendation about document freshness if many are old
    const oldDocsCount = rawRecommendations.filter((r) => r.docDate && r.docDate < sixMonthsAgo).length;
    if (oldDocsCount > rawRecommendations.length / 2 && rawRecommendations.length > 2) {
      summarized.push(
        "⚠️ Большинство документов старше 6 месяцев — рекомендуем обновить основные исследования для актуальности данных",
      );
    }

    return summarized;
  }, [selectedArticleLinks, userDocuments]);

  // Structured examinations list for the new block
  const structuredExaminations = useMemo(() => {
    if (summarizedRecommendations.length === 0) return { analyses: [] as string[], examinations: [] as string[], consultations: [] as string[] };

    const analyses: string[] = [];
    const examinations: string[] = [];
    const consultations: string[] = [];

    summarizedRecommendations.forEach((rec) => {
      const lower = rec.toLowerCase();
      if (/консультац|врач|специалист|невролог|кардиолог|терапевт|хирург|ортопед|офтальмолог|лор|психиатр|дерматолог|гастроэнтеролог|эндокринолог|уролог|пульмонолог/.test(lower)) {
        consultations.push(rec);
      } else if (/мрт|кт|узи|рентген|экг|кардиограм|холтер|томограф|флюорог|инструментальн|лучев|обследован|госпитализ|стационар/.test(lower)) {
        examinations.push(rec);
      } else {
        analyses.push(rec);
      }
    });

    return { analyses, examinations, consultations };
  }, [summarizedRecommendations]);

  // Format examinations as numbered text for editing/export
  const examinationsText = useMemo(() => {
    const lines: string[] = [];
    let num = 1;

    if (structuredExaminations.analyses.length > 0) {
      lines.push("АНАЛИЗЫ:");
      structuredExaminations.analyses.forEach((r) => {
        lines.push(`${num}. ${r}`);
        num++;
      });
      lines.push("");
    }
    if (structuredExaminations.examinations.length > 0) {
      lines.push("ОБСЛЕДОВАНИЯ:");
      structuredExaminations.examinations.forEach((r) => {
        lines.push(`${num}. ${r}`);
        num++;
      });
      lines.push("");
    }
    if (structuredExaminations.consultations.length > 0) {
      lines.push("КОНСУЛЬТАЦИИ ВРАЧЕЙ:");
      structuredExaminations.consultations.forEach((r) => {
        lines.push(`${num}. ${r}`);
        num++;
      });
    }

    return lines.join("\n");
  }, [structuredExaminations]);

  // Global recommendations based ONLY on questionnaire documents
  const globalExaminationsText = useMemo(() => {
    // Find questionnaire documents only
    const questionnaireDocs = userDocuments.filter(
      (doc) => doc.meta && typeof doc.meta === "object" && (doc.meta as any).is_questionnaire
    );

    if (questionnaireDocs.length === 0) return "";

    // Collect recommendations from questionnaire document links only
    const questionnaireDocIds = new Set(questionnaireDocs.map((d) => d.id));
    const questionnaireLinks = documentArticleLinks.filter((link) => questionnaireDocIds.has(link.document_id));

    const allRecs: string[] = [];

    // Also use ai_recommendations directly from questionnaire documents
    questionnaireDocs.forEach((doc) => {
      if (doc.ai_recommendations && Array.isArray(doc.ai_recommendations)) {
        doc.ai_recommendations.forEach((rec) => {
          const lower = rec.toLowerCase();
          // Filter out treatment recommendations
          if (/лечени|терапи|принимать|препарат|таблетк|курс лечения|назначен/i.test(lower)) return;
          if (!allRecs.some(r => r.toLowerCase().includes(lower.slice(0, 30)) || lower.includes(r.toLowerCase().slice(0, 30)))) {
            allRecs.push(rec);
          }
        });
      }
    });

    questionnaireLinks.forEach((link) => {
      if (link.ai_recommendations && Array.isArray(link.ai_recommendations)) {
        link.ai_recommendations.forEach((rec) => {
          const lower = rec.toLowerCase();
          // Filter out treatment recommendations
          if (/лечени|терапи|принимать|препарат|таблетк|курс лечения|назначен/i.test(lower)) return;
          if (!allRecs.some(r => r.toLowerCase().includes(lower.slice(0, 30)) || lower.includes(r.toLowerCase().slice(0, 30)))) {
            allRecs.push(rec);
          }
        });
      }
    });

    if (allRecs.length === 0) return "";

    const analyses: string[] = [];
    const examinations: string[] = [];
    const consultations: string[] = [];

    // Extract specific specialist names for consultations
    const specialistPatterns: { pattern: RegExp; name: string }[] = [
      { pattern: /невролог/i, name: "Невролог" },
      { pattern: /кардиолог/i, name: "Кардиолог" },
      { pattern: /терапевт/i, name: "Терапевт" },
      { pattern: /хирург/i, name: "Хирург" },
      { pattern: /ортопед/i, name: "Ортопед" },
      { pattern: /офтальмолог|окулист/i, name: "Офтальмолог" },
      { pattern: /лор|отоларинголог/i, name: "ЛОР (отоларинголог)" },
      { pattern: /психиатр/i, name: "Психиатр" },
      { pattern: /психотерапевт/i, name: "Психотерапевт" },
      { pattern: /дерматолог/i, name: "Дерматолог" },
      { pattern: /гастроэнтеролог/i, name: "Гастроэнтеролог" },
      { pattern: /эндокринолог/i, name: "Эндокринолог" },
      { pattern: /уролог/i, name: "Уролог" },
      { pattern: /пульмонолог/i, name: "Пульмонолог" },
      { pattern: /аллерголог/i, name: "Аллерголог" },
      { pattern: /онколог/i, name: "Онколог" },
      { pattern: /стоматолог/i, name: "Стоматолог" },
      { pattern: /ревматолог/i, name: "Ревматолог" },
      { pattern: /нефролог/i, name: "Нефролог" },
    ];

    const addedSpecialists = new Set<string>();

    allRecs.forEach((rec) => {
      const lower = rec.toLowerCase();
      if (/консультац|врач|специалист/.test(lower)) {
        // Extract individual specialists
        specialistPatterns.forEach(({ pattern, name }) => {
          if (pattern.test(lower) && !addedSpecialists.has(name)) {
            consultations.push(`Консультация ${name.toLowerCase()}а`);
            addedSpecialists.add(name);
          }
        });
        // If no specific specialist matched, add the generic rec
        if (!specialistPatterns.some(({ pattern }) => pattern.test(lower))) {
          consultations.push(rec);
        }
      } else if (/мрт|кт|узи|рентген|экг|кардиограм|холтер|томограф|флюорог|инструментальн|лучев|обследован|госпитализ|стационар/i.test(lower)) {
        examinations.push(rec);
      } else {
        // For analyses - extract just the name
        const cleanedRec = rec.replace(/^(сдать|пройти|выполнить|сделать)\s+/i, "").replace(/\s*[-–—]\s*.*$/, "");
        analyses.push(cleanedRec);
      }
    });

    const lines: string[] = [];
    let num = 1;
    if (analyses.length > 0) {
      lines.push("АНАЛИЗЫ:");
      analyses.forEach((r) => { lines.push(`${num}. ${r}`); num++; });
      lines.push("");
    }
    if (examinations.length > 0) {
      lines.push("ОБСЛЕДОВАНИЯ:");
      examinations.forEach((r) => { lines.push(`${num}. ${r}`); num++; });
      lines.push("");
    }
    if (consultations.length > 0) {
      lines.push("КОНСУЛЬТАЦИИ ВРАЧЕЙ:");
      consultations.forEach((r) => { lines.push(`${num}. ${r}`); num++; });
    }
    return lines.join("\n");
  }, [documentArticleLinks, userDocuments]);

  // AI explanation from questionnaire documents
  const questionnaireExplanation = useMemo(() => {
    const questionnaireDocs = userDocuments.filter(
      (doc) => doc.meta && typeof doc.meta === "object" && (doc.meta as any).is_questionnaire
    );
    // Get the most recent questionnaire with an explanation
    for (const doc of questionnaireDocs) {
      const explanation = (doc as any).ai_explanation;
      if (explanation) return explanation as string;
    }
    return "";
  }, [userDocuments]);

  // Sync global exams text
  useEffect(() => {
    setEditedGlobalExamsText(globalExaminationsText);
    setIsEditingGlobalExams(false);
  }, [globalExaminationsText]);

  const handleDownloadGlobalExamsDocx = async () => {
    if (!user) return;
    setIsGeneratingGlobalDoc(true);
    try {
      const contentToExport = isEditingGlobalExams ? editedGlobalExamsText : globalExaminationsText;
      const fullContent = `ПЛАН ОБСЛЕДОВАНИЙ\nНа основании всех загруженных медицинских документов\nДата: ${new Date().toLocaleDateString("ru-RU")}\n\n${contentToExport}`;

      const response = await fetch(
        `https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/generate-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            docType: "obsledovaniya",
            format: "docx",
            customContent: fullContent,
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Ошибка генерации документа (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan_obsledovaniy.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Документ скачан");
    } catch (error) {
      console.error("Error generating doc:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка при генерации документа");
    } finally {
      setIsGeneratingGlobalDoc(false);
    }
  };

  const handlePrintGlobalExams = () => {
    const contentToPrint = isEditingGlobalExams ? editedGlobalExamsText : globalExaminationsText;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>План обследований</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;line-height:1.8;font-size:14px}
      h1{font-size:18px;margin-bottom:20px}pre{white-space:pre-wrap;font-family:inherit}</style></head>
      <body><h1>План обследований</h1>
      <p>На основании всех загруженных медицинских документов</p>
      <p>Дата: ${new Date().toLocaleDateString("ru-RU")}</p>
      <pre>${contentToPrint}</pre></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Sync editable text when article changes
  useEffect(() => {
    setEditedExamsText(examinationsText);
    setIsEditingExams(false);
  }, [examinationsText]);

  const handleDownloadExamsDocx = async () => {
    if (!user || !selectedArticle) return;
    setIsGeneratingDoc(true);
    try {
      const contentToExport = isEditingExams ? editedExamsText : examinationsText;
      const fullContent = `МИНИМАЛЬНЫЕ НЕОБХОДИМЫЕ ОБСЛЕДОВАНИЯ\nСтатья ${selectedArticle.article_number}: ${selectedArticle.title}\n\n${contentToExport}`;

      const response = await fetch(
        `https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/generate-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            docType: "obsledovaniya",
            format: "docx",
            customContent: fullContent,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Ошибка генерации документа (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `obsledovaniya_st${selectedArticle.article_number}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Документ скачан");
    } catch (error) {
      console.error("Error generating doc:", error);
      toast.error("Ошибка при генерации документа");
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const handlePrintExams = () => {
    const contentToPrint = isEditingExams ? editedExamsText : examinationsText;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Обследования - ст. ${selectedArticle?.article_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;line-height:1.8;font-size:14px}
      h1{font-size:18px;margin-bottom:20px}pre{white-space:pre-wrap;font-family:inherit}</style></head>
      <body><h1>Минимальные необходимые обследования</h1>
      <p>Статья ${selectedArticle?.article_number}: ${selectedArticle?.title}</p>
      <pre>${contentToPrint}</pre></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Pie chart data
  const pieChartData = useMemo(() => {
    if (!chanceData) return [];

    if (chanceData.noData === 100) {
      return [{ name: "Нет данных", value: 100, color: "#94a3b8" }];
    }

    return [
      { name: "Категория В", value: chanceData.categoryB, color: "#10b981" },
      { name: "Категория А/Б", value: chanceData.categoryA, color: "#f59e0b" },
      { name: "Недостаточно данных", value: chanceData.noData, color: "#94a3b8" },
    ].filter((item) => item.value > 0);
  }, [chanceData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12 pb-24 md:pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2 sm:gap-3">
              <div
                className="p-2 sm:p-3 rounded-xl flex-shrink-0 animate-gradient-shift"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #ec4899)",
                  backgroundSize: "200% 200%",
                }}
              >
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <span className="truncate">История болезни</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Расписание болезней • {articles.length} статей</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto flex-shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate("/medical-questionnaire")}
              className="gap-1"
            >
              <ClipboardList className="h-4 w-4" />
              Опросник
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              Назад
            </Button>
          </div>
        </div>

        {/* Global Recommendations Block - Fixed above articles */}
        {globalExaminationsText && (
          <Card className="mb-6 border-2 border-indigo-500/50 shadow-lg">
            <CardHeader className="px-3 sm:px-6 pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Stethoscope className="h-5 w-5" />
                  План обследований
                  <Badge variant="secondary" className="text-[10px]">На основании опросника</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isEditingGlobalExams) {
                        setIsEditingGlobalExams(false);
                      } else {
                        setEditedGlobalExamsText(globalExaminationsText);
                        setIsEditingGlobalExams(true);
                      }
                    }}
                    className="text-xs gap-1"
                  >
                    {isEditingGlobalExams ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {isEditingGlobalExams ? "Готово" : "Редактировать"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadGlobalExamsDocx}
                    disabled={isGeneratingGlobalDoc}
                    className="text-xs gap-1"
                  >
                    {isGeneratingGlobalDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    DOCX
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintGlobalExams}
                    className="text-xs gap-1"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Печать
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {isEditingGlobalExams ? (
                <Textarea
                  value={editedGlobalExamsText}
                  onChange={(e) => setEditedGlobalExamsText(e.target.value)}
                  className="min-h-[200px] text-sm font-mono leading-relaxed"
                  placeholder="Редактируйте план обследований..."
                />
              ) : (
                <pre className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed font-sans">{globalExaminationsText}</pre>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Diagnostic Reasoning from Questionnaire */}
        {questionnaireExplanation && (
          <Card className="mb-6 border-2 border-amber-500/50 shadow-lg">
            <CardHeader className="px-3 sm:px-6 pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <BookOpen className="h-5 w-5" />
                Обоснование ИИ
                <Badge variant="secondary" className="text-[10px]">На основании опросника</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="bg-muted/50 rounded-lg p-3 sm:p-4 border">
                <p className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {questionnaireExplanation}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4 sm:gap-6">
          {/* Sidebar - Articles List */}
          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                Оглавление
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск статей..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px] sm:h-[calc(100vh-380px)] sm:max-h-[550px]">
                <div className="p-2 space-y-4">
                  {Object.entries(groupedArticles).map(([category, categoryArticles]) => (
                    <div key={category}>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: categoryColors[category] || "#94a3b8" }}
                        />
                        {categoryLabels[category] || category}
                      </div>
                      <div className="space-y-1">
                        {categoryArticles.map((article) => {
                          const hasDocuments = documentArticleLinks.some((link) => link.article_id === article.id);
                          return (
                            <button
                              key={article.id}
                              onClick={() => setSelectedArticle(article)}
                              className={`
                                w-full text-left px-3 py-2 rounded-lg transition-all duration-200
                                flex items-center gap-2 group text-sm
                                ${
                                  selectedArticle?.id === article.id
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "hover:bg-muted"
                                }
                              `}
                            >
                              <span className={`flex-shrink-0 w-8 ${hasDocuments ? "font-bold" : "font-medium"}`}>
                                {article.article_number}
                              </span>
                              <span
                                className={`truncate ${
                                  selectedArticle?.id === article.id
                                    ? "text-primary-foreground/90"
                                    : hasDocuments
                                      ? "text-foreground font-semibold"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {article.title}
                              </span>
                              {hasDocuments && <FileCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                              <ChevronRight
                                className={`h-4 w-4 flex-shrink-0 ml-auto transition-transform ${
                                  selectedArticle?.id === article.id ? "" : "opacity-0 group-hover:opacity-100"
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="space-y-6">
            {selectedArticle ? (
              <>
                {/* Article Content */}
                <Card>
                  <CardHeader className="px-3 sm:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                      <div className="min-w-0">
                        <Badge
                          style={{
                            backgroundColor: categoryColors[selectedArticle.category] || "#94a3b8",
                            color: "white",
                          }}
                          className="mb-2 text-xs"
                        >
                          {categoryLabels[selectedArticle.category] || selectedArticle.category}
                        </Badge>
                        <CardTitle className="text-lg sm:text-xl md:text-2xl break-words">
                          Статья {selectedArticle.article_number}: {selectedArticle.title}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-primary hover:underline w-full justify-between py-1">
                        <span>📜 Полный текст статьи</span>
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="prose prose-sm dark:prose-invert max-w-none mt-3">
                          <pre className="whitespace-pre-wrap font-sans text-foreground bg-muted/50 rounded-lg p-3 sm:p-4 border text-xs sm:text-sm leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto">
                            {selectedArticle.body}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>

                {/* Category B Chances Chart - Dynamic */}
                <Card>
                  <CardHeader className="px-3 sm:px-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      📊 Вероятность категории «В»
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    {chanceData?.noData === 100 ? (
                      <div className="text-center py-6 sm:py-8">
                        <AlertCircle className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-base sm:text-lg font-medium mb-2">Нет данных для анализа</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Загрузите документы для расчёта вероятности
                        </p>
                        <Button size="sm" onClick={() => navigate("/medical-documents")}>
                          Загрузить документы
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                          <div className="h-[200px] sm:h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={pieChartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={40}
                                  outerRadius={70}
                                  paddingAngle={3}
                                  dataKey="value"
                                  animationBegin={0}
                                  animationDuration={800}
                                >
                                  {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => [`${value}%`, "Вероятность"]} />
                                <Legend wrapperStyle={{ fontSize: "12px" }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="space-y-3 sm:space-y-4">
                            <div className="p-3 sm:p-4 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3 mb-2">
                                {chanceData && chanceData.categoryB >= 50 ? (
                                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                                )}
                                <span className="text-xl sm:text-2xl font-bold">{chanceData?.categoryB || 0}%</span>
                              </div>
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Вероятность категории «В» на основе документов
                              </p>
                            </div>

                            <div className="space-y-2 text-sm">
                              <p className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                <span>
                                  Найдено релевантных документов: <strong>{chanceData?.relevantDocsCount || 0}</strong>
                                </span>
                              </p>

                              {chanceData && chanceData.categoryB > 0 && (
                                <p className="text-muted-foreground text-xs mt-4">
                                  * Для повышения шансов рекомендуется:
                                </p>
                              )}

                              {chanceData && chanceData.categoryB < 70 && chanceData.categoryB > 0 && (
                                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                                  <li>Добавить документы с давностью диагноза более 6 месяцев</li>
                                  <li>Загрузить выписки из стационаров</li>
                                  <li>Добавить результаты обследований и анализов</li>
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* AI Recommendations */}
                {summarizedRecommendations.length > 0 && (
                  <Card className="border-primary/50">
                    <CardHeader className="px-3 sm:px-6">
                      <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-primary">
                        <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                        Рекомендации ИИ
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6">
                      <ul className="space-y-2">
                        {summarizedRecommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                            <span className="text-primary font-bold">{idx + 1}.</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Relevant Documents */}
                <Card>
                  <CardHeader className="px-3 sm:px-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <FileCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                      Релевантные документы
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6">
                    {documentsWithLinks.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground">
                        <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
                        <p className="mb-2 text-sm">Нет документов по данной статье</p>
                        <p className="text-xs sm:text-sm">
                          Загрузите документы: <strong className="break-words">{selectedArticle.title}</strong>
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => navigate("/medical-documents")}
                        >
                          Загрузить документы
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {documentsWithLinks.slice(0, 10).map(({ document: doc, link }) => (
                          <div
                            key={`${doc.id}-${link.id}`}
                            className="flex flex-col gap-2 p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">{doc.title || "Без названия"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(doc.uploaded_at).toLocaleDateString("ru-RU")}
                                  {link.ai_category_chance !== null && (
                                    <span className="ml-2 text-primary font-medium">
                                      • {link.ai_category_chance}% шанс В
                                    </span>
                                  )}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-shrink-0 text-xs"
                                onClick={async () => {
                                  const url = await getSignedDocumentUrl(doc.file_url);
                                  if (url) window.open(url, "_blank");
                                }}
                              >
                                Открыть
                              </Button>
                            </div>
                            {link.ai_explanation && (
                              <p className="text-xs text-muted-foreground pl-6 sm:pl-7 border-l-2 border-primary/20 ml-2">
                                {link.ai_explanation}
                              </p>
                            )}
                          </div>
                        ))}
                        {documentsWithLinks.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center">
                            И ещё {documentsWithLinks.length - 10} документов...
                          </p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => navigate("/medical-documents")}
                        >
                          Все документы →
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Минимальные необходимые обследования */}
                {(structuredExaminations.analyses.length > 0 || structuredExaminations.examinations.length > 0 || structuredExaminations.consultations.length > 0) && (
                  <Card className="border-emerald-500/50">
                    <CardHeader className="px-3 sm:px-6">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
                          Минимальные необходимые обследования
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (isEditingExams) {
                                setIsEditingExams(false);
                              } else {
                                setEditedExamsText(examinationsText);
                                setIsEditingExams(true);
                              }
                            }}
                            className="text-xs gap-1"
                          >
                            {isEditingExams ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            {isEditingExams ? "Готово" : "Редактировать"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadExamsDocx}
                            disabled={isGeneratingDoc}
                            className="text-xs gap-1"
                          >
                            {isGeneratingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            DOCX
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrintExams}
                            className="text-xs gap-1"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Печать
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6">
                      {isEditingExams ? (
                        <Textarea
                          value={editedExamsText}
                          onChange={(e) => setEditedExamsText(e.target.value)}
                          className="min-h-[200px] text-sm font-mono leading-relaxed"
                          placeholder="Редактируйте список обследований..."
                        />
                      ) : (
                        <div className="space-y-4">
                          {structuredExaminations.analyses.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Анализы</h4>
                              <ol className="space-y-2">
                                {structuredExaminations.analyses.map((rec, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0">{idx + 1}.</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {structuredExaminations.examinations.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Обследования</h4>
                              <ol className="space-y-2" start={structuredExaminations.analyses.length + 1}>
                                {structuredExaminations.examinations.map((rec, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0">{structuredExaminations.analyses.length + idx + 1}.</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {structuredExaminations.consultations.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Консультации врачей</h4>
                              <ol className="space-y-2" start={structuredExaminations.analyses.length + structuredExaminations.examinations.length + 1}>
                                {structuredExaminations.consultations.map((rec, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0">{structuredExaminations.analyses.length + structuredExaminations.examinations.length + idx + 1}.</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-12 text-center">
                <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Выберите статью из оглавления</p>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 3s ease infinite;
        }
      `}</style>
    </div>
  );
}
