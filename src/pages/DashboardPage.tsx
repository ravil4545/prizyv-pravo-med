import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, User, LogOut, Settings, BookOpen, Star, BarChart3, FileHeart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DashboardPage = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      setProfile(profileData);

      // Check if user is admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const hasAdminRole = roles?.some(r => r.role === "admin");
      setIsAdmin(hasAdminRole || false);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Выход выполнен",
      description: "Вы успешно вышли из системы",
    });
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12">
          <div className="text-center">Загрузка...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Личный кабинет</h1>
              <p className="text-muted-foreground">
                {profile?.full_name || user?.email}
              </p>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/dashboard/templates")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Шаблоны заявлений</CardTitle>
                    <CardDescription>
                      Готовые шаблоны документов для призывников
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Постановка на учёт, снятие с учёта, отсрочки и другие документы
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/dashboard/ai-chat")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Продвинутый AI чат</CardTitle>
                    <CardDescription>
                      Персональный юридический помощник
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Получите детальные консультации по вашей ситуации
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/forum")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Форум</CardTitle>
                    <CardDescription>
                      Обсуждения и вопросы призывников
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Задайте вопросы и поделитесь опытом с другими
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/profile")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Профиль</CardTitle>
                    <CardDescription>
                      Настройки вашего аккаунта
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Управление личными данными и настройками
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/dashboard/medical-documents")}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <FileHeart className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Медицинские документы</CardTitle>
                    <CardDescription>
                      Загрузка и анализ медицинских документов
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  AI анализ медицинских документов и рекомендации
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl group overflow-hidden"
              onClick={() => navigate("/medical-history")}
              style={{
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(236, 72, 153, 0.1))",
              }}
            >
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(236, 72, 153, 0.15))",
                }}
              />
              <CardHeader className="relative">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-3 rounded-lg shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #ec4899)",
                    }}
                  >
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
                      История болезни (AI)
                    </CardTitle>
                    <CardDescription>
                      Постановление №565 с AI анализом
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                <p className="text-sm text-muted-foreground">
                  Расписание болезней, шансы на категорию В и персональные рекомендации
                </p>
              </CardContent>
            </Card>
          </div>

          {isAdmin && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-4">Администрирование</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/admin/analytics")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <BarChart3 className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <CardTitle>Аналитика сайта</CardTitle>
                        <CardDescription>
                          Статистика посещений и активности
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Полная аналитика посетителей, страниц и поведения пользователей
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/admin/forum")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <Settings className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <CardTitle>Управление форумом</CardTitle>
                        <CardDescription>
                          Модерация тем и сообщений
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Одобрение, отклонение и управление постами на форуме
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/admin/blog")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <BookOpen className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <CardTitle>Управление блогом</CardTitle>
                        <CardDescription>
                          Создание и редактирование статей
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Публикация и редактирование статей блога
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/admin/testimonials")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <Star className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <CardTitle>Управление отзывами</CardTitle>
                        <CardDescription>
                          Модерация отзывов клиентов
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Одобрение и удаление отзывов
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/admin/users")}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <User className="h-6 w-6 text-destructive" />
                      </div>
                      <div>
                        <CardTitle>Пользователи и подписки</CardTitle>
                        <CardDescription>
                          Управление доступом пользователей
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Список пользователей, статус оплаты, переключение режимов
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DashboardPage;
