import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, User, LogOut, Settings, BookOpen, Star, BarChart3, FileHeart, UserPlus, ChevronRight, Sparkles, ClipboardList, Calendar, Trophy, Building2, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SubscriptionStatusCard from "@/components/SubscriptionStatusCard";
import { useDemoMode } from "@/hooks/useDemoMode";
import OnboardingWizard, { isOnboardingDone } from "@/components/OnboardingWizard";
import { GridSkeleton } from "@/components/LoadingSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import ShareWithLawyer from "@/components/ShareWithLawyer";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { cn } from "@/lib/utils";

interface DashboardCard {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  gradient?: string;
  featured?: boolean;
  tag?: string;
}

const DashboardPage = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isDemoMode } = useDemoMode();
  const { unreadCount } = useUnreadMessages();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      setUser(session.user);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setProfile(profileData);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      setIsAdmin(roles?.some(r => r.role === "admin") || false);

      // Show onboarding for new users who haven't completed it
      if (!isOnboardingDone() && !profileData?.full_name) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Выход выполнен", description: "Вы успешно вышли из системы" });
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-10 pb-24 md:pb-12">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <GridSkeleton cols={3} rows={2} />
          </div>
        </main>
      </div>
    );
  }

  const mainCards: DashboardCard[] = [
    {
      title: "ИИ помощник",
      description: "Персональный юридический и медицинский консультант по вопросам призыва",
      icon: MessageSquare,
      path: "/dashboard/ai-chat",
      featured: true,
      tag: "Популярное",
      gradient: "from-primary to-accent",
    },
    {
      title: "ИИ анализ документов",
      description: "Загрузите медицинские документы для автоматического AI-анализа",
      icon: FileHeart,
      path: "/dashboard/medical-documents",
      tag: "AI",
      gradient: "from-accent to-primary",
    },
    {
      title: "ИИ история болезни",
      description: "88 статей Расписания болезней с AI-оценкой категории годности",
      icon: BookOpen,
      path: "/medical-history",
      tag: "Новое",
      gradient: "from-primary to-primary-dark",
    },
    {
      title: "Шаблоны заявлений",
      description: "Готовые документы: постановка на учёт, отсрочки и другое",
      icon: FileText,
      path: "/dashboard/templates",
    },
    {
      title: "Медицинский опросник",
      description: "Заполните опросник для AI-анализа вашей ситуации",
      icon: ClipboardList,
      path: "/medical-questionnaire",
    },
    {
      title: "Трекинг дела",
      description: "Фиксируйте этапы призывного дела: комиссии, обжалования, суды",
      icon: Calendar,
      path: "/dashboard/case-tracking",
      tag: "Новое",
    },
  ];

  if (!isDemoMode) {
    mainCards.push({
      title: "Профиль",
      description: "Управление личными данными и настройками аккаунта",
      icon: User,
      path: "/profile",
    });
  }

  const communityCards: DashboardCard[] = [
    {
      title: "База успешных кейсов",
      description: "Реальные истории призывников с непризывными категориями",
      icon: Trophy,
      path: "/success-cases",
    },
    {
      title: "Справочник военкоматов",
      description: "Рейтинги и отзывы о военкоматах от призывников",
      icon: Building2,
      path: "/commissariats",
    },
  ];

  const adminCards: DashboardCard[] = [
    { title: "Аналитика сайта", description: "Статистика посещений", icon: BarChart3, path: "/admin/analytics" },
    { title: "Управление форумом", description: "Модерация тем", icon: Settings, path: "/admin/forum" },
    { title: "Управление блогом", description: "Статьи блога", icon: BookOpen, path: "/admin/blog" },
    { title: "Управление отзывами", description: "Модерация отзывов", icon: Star, path: "/admin/testimonials" },
    { title: "Пользователи", description: "Управление доступом", icon: User, path: "/admin/users" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 md:py-10 pb-24 md:pb-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Личный кабинет
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {isDemoMode ? "Демо-режим — ограниченный доступ" : (profile?.full_name || user?.email)}
              </p>
            </div>
            {!isDemoMode && (
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Выйти</span>
              </Button>
            )}
          </div>

          {/* Subscription Status */}
          <div className="mb-6">
            <SubscriptionStatusCard />
          </div>

          {/* Lawyer Chat Banner */}
          {!isDemoMode && (
            <div
              onClick={() => navigate("/client/messages")}
              className={cn(
                "mb-6 cursor-pointer rounded-xl border px-4 py-3.5 flex items-center gap-3.5",
                "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                unreadCount > 0
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/60 bg-muted/20 hover:bg-muted/40"
              )}
            >
              {/* Icon with unread badge */}
              <div className={cn(
                "relative flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center",
                unreadCount > 0
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
              )}>
                <Briefcase className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 animate-pulse">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    "font-semibold text-sm",
                    unreadCount > 0 ? "text-primary" : "text-foreground"
                  )}>
                    Чат с юристом
                  </p>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0 h-4">
                      {unreadCount} новых
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {unreadCount > 0
                    ? "Юрист написал вам — нажмите, чтобы ответить"
                    : "Переписка с вашим юристом"}
                </p>
              </div>

              <ChevronRight className={cn(
                "h-4 w-4 flex-shrink-0 transition-colors",
                unreadCount > 0 ? "text-primary" : "text-muted-foreground/50 group-hover:text-primary"
              )} />
            </div>
          )}

          {/* Main Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mainCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.path}
                  className={`group cursor-pointer transition-all duration-300 hover:shadow-medium hover:-translate-y-0.5 overflow-hidden relative ${
                    card.featured ? "sm:col-span-2 lg:col-span-1 border-primary/20" : "border-border/50"
                  }`}
                  onClick={() => navigate(card.path)}
                >
                  {/* Gradient accent bar */}
                  {card.gradient && (
                    <div className={`h-1 w-full bg-gradient-to-r ${card.gradient}`} />
                  )}
                  
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                        card.gradient 
                          ? `bg-gradient-to-br ${card.gradient} shadow-sm` 
                          : "bg-primary/8 group-hover:bg-primary/12"
                      }`}>
                        <Icon className={`h-5 w-5 ${card.gradient ? "text-white" : "text-primary"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground text-sm md:text-base truncate">
                            {card.title}
                          </h3>
                          {card.tag && (
                            <Badge tag={card.tag} />
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
                          {card.description}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Community Section */}
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-3 text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Сообщество
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {communityCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.path}
                    className="group cursor-pointer transition-all duration-300 hover:shadow-medium hover:-translate-y-0.5 border-border/50"
                    onClick={() => navigate(card.path)}
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl shrink-0 bg-primary/8 group-hover:bg-primary/12 transition-colors">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm md:text-base">{card.title}</h3>
                          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">{card.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Admin Section */}
          {isAdmin && (
            <div className="mt-8">
              <h2 className="text-lg font-bold mb-3 text-foreground flex items-center gap-2">
                <Settings className="h-5 w-5 text-destructive" />
                Администрирование
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {adminCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card
                      key={card.path}
                      className="cursor-pointer hover:shadow-soft transition-all hover:-translate-y-0.5 border-destructive/10"
                      onClick={() => navigate(card.path)}
                    >
                      <CardContent className="p-3 text-center">
                        <div className="p-2 bg-destructive/8 rounded-lg w-fit mx-auto mb-2">
                          <Icon className="h-4 w-4 text-destructive" />
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
      <div className="container mx-auto px-4 pb-8 max-w-5xl">
        <ShareWithLawyer />
      </div>
      <Footer />
      {user && (
        <OnboardingWizard
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          userId={user.id}
        />
      )}
    </div>
  );
};

function Badge({ tag }: { tag: string }) {
  const colors: Record<string, string> = {
    "Популярное": "bg-accent/10 text-accent",
    "AI": "bg-primary/10 text-primary",
    "Новое": "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${colors[tag] || "bg-muted text-muted-foreground"}`}>
      {tag}
    </span>
  );
}

export default DashboardPage;
