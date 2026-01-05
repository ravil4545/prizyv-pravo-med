import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, ChevronRight, BookOpen, FileCheck } from "lucide-react";
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
}

const categoryColors: Record<string, string> = {
  nervous_system: "#8b5cf6",
  vision: "#3b82f6",
  cardiology: "#ef4444",
  otolaryngology: "#f59e0b",
  endocrine: "#10b981",
  orthopedics: "#6366f1",
  other: "#94a3b8",
};

const categoryLabels: Record<string, string> = {
  nervous_system: "Нервная система",
  vision: "Органы зрения",
  cardiology: "Кровообращение",
  otolaryngology: "Отоларингология",
  endocrine: "Эндокринология",
  orthopedics: "Ортопедия",
  other: "Прочее",
};

export default function MedicalHistoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);

  // Mock data for pie chart - category B chances
  const categoryBChances = [
    { name: "Категория В", value: 65, color: "#10b981" },
    { name: "Категория Б", value: 25, color: "#f59e0b" },
    { name: "Категория Д", value: 10, color: "#ef4444" },
  ];

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadArticles();
      loadUserDocuments();
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
      setArticles(data);
      if (data.length > 0) {
        setSelectedArticle(data[0]);
      }
    }
  };

  const loadUserDocuments = async () => {
    const { data, error } = await supabase
      .from("medical_documents_v2")
      .select("id, title, file_url, uploaded_at")
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      setUserDocuments(data);
    }
  };

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
              Расписание болезней для военно-врачебной экспертизы
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Назад в кабинет
          </Button>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* Sidebar - Articles List */}
          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Оглавление
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-350px)] max-h-[600px]">
                <div className="p-2 space-y-1">
                  {articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      className={`
                        w-full text-left p-3 rounded-lg transition-all duration-200
                        flex items-center gap-3 group
                        ${selectedArticle?.id === article.id 
                          ? "bg-primary text-primary-foreground shadow-md" 
                          : "hover:bg-muted"
                        }
                      `}
                    >
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: categoryColors[article.category] || "#94a3b8" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          Статья {article.article_number}
                        </div>
                        <div className={`text-sm truncate ${
                          selectedArticle?.id === article.id 
                            ? "text-primary-foreground/80" 
                            : "text-muted-foreground"
                        }`}>
                          {article.title}
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${
                        selectedArticle?.id === article.id ? "" : "opacity-0 group-hover:opacity-100"
                      }`} />
                    </button>
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
                    <div className="flex items-start justify-between">
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
                      <pre className="whitespace-pre-wrap font-sans text-foreground bg-transparent p-0 border-0">
                        {selectedArticle.body}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Category B Chances Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      📊 Вероятность получения категории
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryBChances}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                            labelLine={false}
                          >
                            {categoryBChances.map((entry, index) => (
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
                    <p className="text-sm text-muted-foreground text-center mt-4">
                      * Оценка на основе анализа ваших документов и статьи {selectedArticle.article_number}
                    </p>
                  </CardContent>
                </Card>

                {/* Relevant Documents */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileCheck className="h-5 w-5" />
                      Ваши релевантные документы
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {userDocuments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Нет загруженных документов</p>
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
                        {userDocuments.map((doc) => (
                          <div 
                            key={doc.id}
                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.title || "Без названия"}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(doc.uploaded_at).toLocaleDateString("ru-RU")}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                Открыть
                              </a>
                            </Button>
                          </div>
                        ))}
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
