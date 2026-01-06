import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, ChevronRight, BookOpen, FileCheck, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

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
  linked_article_id: string | null;
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

// Calculate Category B chance based on document analysis
function calculateCategoryBChance(
  article: Article,
  documents: UserDocument[],
  assessments: ArticleAssessment[]
): { categoryB: number; categoryA: number; noData: number; hasRelevantDocs: boolean; relevantDocsCount: number } {
  // Check if there's a saved assessment for this article
  const assessment = assessments.find(a => a.article_id === article.id);
  if (assessment && assessment.score_v !== null) {
    const score = assessment.score_v;
    return {
      categoryB: score,
      categoryA: Math.max(0, 100 - score - 5),
      noData: 5,
      hasRelevantDocs: true,
      relevantDocsCount: documents.length,
    };
  }

  if (documents.length === 0) {
    return {
      categoryB: 0,
      categoryA: 0,
      noData: 100,
      hasRelevantDocs: false,
      relevantDocsCount: 0,
    };
  }

  const keywords = categoryBKeywords[article.category] || [];
  let relevantDocsCount = 0;
  let totalScore = 0;

  documents.forEach((doc) => {
    const textToSearch = [
      doc.title?.toLowerCase() || "",
      doc.raw_text?.toLowerCase() || "",
      JSON.stringify(doc.meta || {}).toLowerCase(),
    ].join(" ");

    let docScore = 0;
    let keywordMatches = 0;

    keywords.forEach((keyword) => {
      const regex = new RegExp(keyword.toLowerCase(), "gi");
      const matches = textToSearch.match(regex);
      if (matches) {
        keywordMatches += matches.length;
      }
    });

    if (keywordMatches > 0) {
      relevantDocsCount++;
      
      // Base score from keyword matches
      docScore = Math.min(30, keywordMatches * 5);

      // Bonus for having raw_text (OCR processed)
      if (doc.raw_text && doc.raw_text.length > 100) {
        docScore += 10;
      }

      // Bonus for document age (older = more established diagnosis)
      const uploadDate = new Date(doc.uploaded_at);
      const monthsAgo = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsAgo >= 12) {
        docScore += 20; // More than a year of documented history
      } else if (monthsAgo >= 6) {
        docScore += 15;
      } else if (monthsAgo >= 3) {
        docScore += 10;
      } else {
        docScore += 5;
      }

      totalScore += docScore;
    }
  });

  if (relevantDocsCount === 0) {
    return {
      categoryB: 0,
      categoryA: 70,
      noData: 30,
      hasRelevantDocs: false,
      relevantDocsCount: 0,
    };
  }

  // Normalize score
  let categoryBScore = Math.min(85, Math.round(totalScore / relevantDocsCount));
  
  // Bonus for multiple relevant documents (shows pattern of medical history)
  if (relevantDocsCount >= 3) {
    categoryBScore = Math.min(90, categoryBScore + 15);
  } else if (relevantDocsCount >= 2) {
    categoryBScore = Math.min(85, categoryBScore + 10);
  }

  return {
    categoryB: categoryBScore,
    categoryA: Math.max(0, 100 - categoryBScore - 5),
    noData: 5,
    hasRelevantDocs: true,
    relevantDocsCount,
  };
}

export default function MedicalHistoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [assessments, setAssessments] = useState<ArticleAssessment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadArticles();
      loadUserDocuments();
      loadAssessments();
    }
  }, [user]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
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
      // Sort by numeric article number
      const sorted = data.sort((a, b) => {
        const numA = parseInt(a.article_number);
        const numB = parseInt(b.article_number);
        return numA - numB;
      });
      setArticles(sorted);
      if (sorted.length > 0) {
        setSelectedArticle(sorted[0]);
      }
    }
  };

  const loadUserDocuments = async () => {
    const { data, error } = await supabase
      .from("medical_documents_v2")
      .select("id, title, file_url, uploaded_at, raw_text, document_type_id, meta, ai_recommendations, ai_fitness_category, ai_category_chance, linked_article_id")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setUserDocuments(data);
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

  // Filter articles by search
  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const query = searchQuery.toLowerCase();
    return articles.filter(
      (article) =>
        article.article_number.toLowerCase().includes(query) ||
        article.title.toLowerCase().includes(query) ||
        (categoryLabels[article.category] || "").toLowerCase().includes(query)
    );
  }, [articles, searchQuery]);

  // Group articles by category
  const groupedArticles = useMemo(() => {
    const groups: Record<string, Article[]> = {};
    filteredArticles.forEach((article) => {
      const cat = article.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(article);
    });
    return groups;
  }, [filteredArticles]);

  // Calculate chance data for selected article
  const chanceData = useMemo(() => {
    if (!selectedArticle) return null;
    return calculateCategoryBChance(selectedArticle, userDocuments, assessments);
  }, [selectedArticle, userDocuments, assessments]);

  // Get relevant documents for selected article
  const relevantDocuments = useMemo(() => {
    if (!selectedArticle || userDocuments.length === 0) return [];
    
    const keywords = categoryBKeywords[selectedArticle.category] || [];
    
    return userDocuments.filter((doc) => {
      // Check if document is linked to this article
      if (doc.linked_article_id === selectedArticle.id) return true;
      
      const textToSearch = [
        doc.title?.toLowerCase() || "",
        doc.raw_text?.toLowerCase() || "",
        JSON.stringify(doc.meta || {}).toLowerCase(),
      ].join(" ");

      return keywords.some((keyword) => textToSearch.includes(keyword.toLowerCase()));
    });
  }, [selectedArticle, userDocuments]);

  // Get all AI recommendations for relevant documents
  const allRecommendations = useMemo(() => {
    const recommendations: string[] = [];
    relevantDocuments.forEach((doc) => {
      if (doc.ai_recommendations && Array.isArray(doc.ai_recommendations)) {
        doc.ai_recommendations.forEach((rec) => {
          if (!recommendations.includes(rec)) {
            recommendations.push(rec);
          }
        });
      }
    });
    return recommendations;
  }, [relevantDocuments]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    if (!chanceData) return [];
    
    if (chanceData.noData === 100) {
      return [
        { name: "Нет данных", value: 100, color: "#94a3b8" },
      ];
    }

    return [
      { name: "Категория В", value: chanceData.categoryB, color: "#10b981" },
      { name: "Категория А/Б", value: chanceData.categoryA, color: "#f59e0b" },
      { name: "Недостаточно данных", value: chanceData.noData, color: "#94a3b8" },
    ].filter(item => item.value > 0);
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
      
      <main className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <div 
                className="p-3 rounded-xl animate-gradient-shift"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #ec4899)",
                  backgroundSize: "200% 200%",
                }}
              >
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              История болезни (Постановление №565)
            </h1>
            <p className="text-muted-foreground">
              Расписание болезней для военно-врачебной экспертизы • {articles.length} статей
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Назад в кабинет
          </Button>
        </div>

        <div className="grid lg:grid-cols-[350px_1fr] gap-6">
          {/* Sidebar - Articles List */}
          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Оглавление
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск статей..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-380px)] max-h-[550px]">
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
                        {categoryArticles.map((article) => (
                          <button
                            key={article.id}
                            onClick={() => setSelectedArticle(article)}
                            className={`
                              w-full text-left px-3 py-2 rounded-lg transition-all duration-200
                              flex items-center gap-2 group text-sm
                              ${selectedArticle?.id === article.id 
                                ? "bg-primary text-primary-foreground shadow-md" 
                                : "hover:bg-muted"
                              }
                            `}
                          >
                            <span className="font-medium flex-shrink-0 w-8">
                              {article.article_number}
                            </span>
                            <span className={`truncate ${
                              selectedArticle?.id === article.id 
                                ? "text-primary-foreground/90" 
                                : "text-muted-foreground"
                            }`}>
                              {article.title}
                            </span>
                            <ChevronRight className={`h-4 w-4 flex-shrink-0 ml-auto transition-transform ${
                              selectedArticle?.id === article.id ? "" : "opacity-0 group-hover:opacity-100"
                            }`} />
                          </button>
                        ))}
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
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Badge 
                          style={{ 
                            backgroundColor: categoryColors[selectedArticle.category] || "#94a3b8",
                            color: "white"
                          }}
                          className="mb-2"
                        >
                          {categoryLabels[selectedArticle.category] || selectedArticle.category}
                        </Badge>
                        <CardTitle className="text-2xl">
                          Статья {selectedArticle.article_number}: {selectedArticle.title}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-foreground bg-transparent p-0 border-0 text-sm leading-relaxed">
                        {selectedArticle.body}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Category B Chances Chart - Dynamic */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      📊 Вероятность получения категории «В» (ограниченно годен)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {chanceData?.noData === 100 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">Нет данных для анализа</h3>
                        <p className="text-muted-foreground mb-4">
                          Загрузите медицинские документы, чтобы рассчитать вероятность получения категории «В»
                        </p>
                        <Button onClick={() => navigate("/medical-documents")}>
                          Загрузить документы
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={pieChartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={3}
                                  dataKey="value"
                                  animationBegin={0}
                                  animationDuration={800}
                                >
                                  {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => [`${value}%`, "Вероятность"]}
                                />
                                <Legend />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          
                          <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3 mb-2">
                                {chanceData && chanceData.categoryB >= 50 ? (
                                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-6 w-6 text-amber-500" />
                                )}
                                <span className="text-2xl font-bold">
                                  {chanceData?.categoryB || 0}%
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Вероятность получения категории «В» на основе ваших документов
                              </p>
                            </div>

                            <div className="space-y-2 text-sm">
                              <p className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                <span>Найдено релевантных документов: <strong>{chanceData?.relevantDocsCount || 0}</strong></span>
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
                {allRecommendations.length > 0 && (
                  <Card className="border-primary/50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2 text-primary">
                        <AlertCircle className="h-5 w-5" />
                        Рекомендации ИИ по статье {selectedArticle.article_number}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {allRecommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
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
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileCheck className="h-5 w-5" />
                      Ваши релевантные документы по статье {selectedArticle.article_number}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {relevantDocuments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="mb-2">Нет документов, соответствующих данной статье</p>
                        <p className="text-sm">
                          Загрузите медицинские документы по теме: <strong>{selectedArticle.title}</strong>
                        </p>
                        <Button 
                          variant="outline" 
                          className="mt-4"
                          onClick={() => navigate("/medical-documents")}
                        >
                          Загрузить документы
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {relevantDocuments.slice(0, 10).map((doc) => (
                          <div 
                            key={doc.id}
                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.title || "Без названия"}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(doc.uploaded_at).toLocaleDateString("ru-RU")}
                                {doc.ai_category_chance !== null && (
                                  <span className="ml-2 text-primary">• Шанс В: {doc.ai_category_chance}%</span>
                                )}
                                {doc.raw_text && (
                                  <span className="ml-2 text-green-600">• OCR</span>
                                )}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                Открыть
                              </a>
                            </Button>
                          </div>
                        ))}
                        {relevantDocuments.length > 10 && (
                          <p className="text-sm text-muted-foreground text-center">
                            И ещё {relevantDocuments.length - 10} документов...
                          </p>
                        )}
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => navigate("/medical-documents")}
                        >
                          Все документы →
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
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
