import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  MessageSquare,
  Settings,
  BookOpen,
  Star,
  BarChart3,
  FileHeart,
  ChevronRight,
  ClipboardList,
  Calendar,
  Trophy,
  Building2,
  Briefcase,
  Users,
  Search,
  User,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import SubscriptionStatusCard from "@/components/SubscriptionStatusCard";
import TrialCountdownCard from "@/components/TrialCountdownCard";
import CaseRoadmap from "@/components/CaseRoadmap";
import { useDemoMode } from "@/hooks/useDemoMode";
import OnboardingWizard, { isOnboardingDone } from "@/components/OnboardingWizard";
import { GridSkeleton } from "@/components/LoadingSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { cn } from "@/lib/utils";
import AICaseSummary from "@/components/dashboard/AICaseSummary";
import NotificationsInbox from "@/components/dashboard/NotificationsInbox";
import CasePlanCard from "@/components/dashboard/CasePlanCard";
import ClientLawyerRequests from "@/components/ClientLawyerRequests";
import ShareWithLawyer from "@/components/ShareWithLawyer";
import ClientCaseStatusCard from "@/components/ClientCaseStatusCard";
import { withBrandPath } from "@/lib/brandPath";

interface DashboardCard {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
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
  const location = useLocation();
  const { toast } = useToast();
  const { isDemoMode } = useDemoMode();
  const { unreadCount } = useUnreadMessages();
  const { isLawyer } = useLawyerProfile();
  const cabinetPath = (target: string) => withBrandPath(location.pathname, target);

  // Кабинеты независимы: юрист тоже может пользоваться обычным личным
  // кабинетом. Авто-редирект на /lawyer убран — вход в кабинет юриста
  // теперь через подвал сайта.

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

      if (!isOnboardingDone() && !profileData?.full_name) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6 md:py-10 md:pb-12">
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

  // Основные рабочие сценарии — 3 ключевые точки входа.
  // ИИ-консультант объединяет чат + анализ документов + историю болезней.
  const primaryCards: DashboardCard[] = [
    {
      title: "ИИ-консультант",
      description: "Чат, анализ документов и оценка по Расписанию болезней",
      icon: MessageSquare,
      path: "/dashboard/ai-chat",
      featured: true,
      tag: "AI",
    },
    {
      title: "Моё досье",
      description: "Документы, опросник, диагнозы — всё, что видит ИИ и юрист",
      icon: FileHeart,
      path: "/dashboard/medical-documents",
    },
    {
      title: "Дело",
      description: "Этапы, комиссии, обжалования, суды — таймлайн вашего дела",
      icon: Calendar,
      path: "/dashboard/case-tracking",
    },
  ];

  // Reference-инструменты — нужны реже, отдельная группа.
  const toolsCards: DashboardCard[] = [
    {
      title: "Расписание болезней",
      description: "88 статей с AI-оценкой шансов категории годности",
      icon: BookOpen,
      path: "/medical-history",
    },
    {
      title: "Опросник для ИИ",
      description: "Заполните жалобы, которые не вошли в справки",
      icon: ClipboardList,
      path: "/medical-questionnaire",
    },
    {
      title: "Шаблоны заявлений",
      description: "Постановка на учёт, отсрочки, обжалования",
      icon: FileText,
      path: "/dashboard/templates",
    },
  ];

  const communityCards: DashboardCard[] = [
    {
      title: "База успешных кейсов",
      description: "Реальные истории призывников с непризывными категориями",
      icon: Trophy,
      path: "/success-cases",
    },
    {
      title: "Справочник военкоматов",
      description: "Рейтинги и отзывы о военкоматах",
      icon: Building2,
      path: "/commissariats",
    },
  ];

  const adminCards: DashboardCard[] = [
    { title: "Обзор", description: "Сводка и заявки", icon: LayoutDashboard, path: "/admin" },
    { title: "Аналитика", description: "Статистика", icon: BarChart3, path: "/admin/analytics" },
    { title: "Форум", description: "Модерация", icon: Settings, path: "/admin/forum" },
    { title: "Блог", description: "Статьи", icon: BookOpen, path: "/admin/blog" },
    { title: "Отзывы", description: "Модерация", icon: Star, path: "/admin/testimonials" },
    { title: "Пользователи", description: "Доступы", icon: User, path: "/admin/users" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 md:py-10 md:pb-12">
        <div className="max-w-5xl mx-auto">
          {/* ── Приветствие. «Личный кабинет» и «Выйти» теперь в обвязке
                 кабинета (DashboardLayout) — здесь не дублируем. ──────────── */}
          <div className="mb-6 flex items-center gap-3">
            {!isDemoMode && (
              <button
                onClick={() => navigate(cabinetPath("/profile"))}
                aria-label="Профиль"
                className="h-11 w-11 rounded-full bg-gold/15 hover:bg-gold/25 transition-colors flex items-center justify-center flex-shrink-0"
              >
                <span className="text-gold-deep font-serif font-semibold text-lg">
                  {(profile?.full_name?.[0] || user?.email?.[0] || "?").toUpperCase()}
                </span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
                {isDemoMode ? "Демо-режим" : profile?.full_name?.split(" ")[0] || "Здравствуйте"}
              </h1>
              {!isDemoMode && (
                <p className="text-xs text-muted-foreground truncate max-w-[260px]">{user?.email}</p>
              )}
            </div>
          </div>

          {/* ── 3 главных сценария — первичные действия сразу под приветствием ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-number">Что делать</span>
              <span className="flex-1 h-px bg-border/50" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {primaryCards.map((card) => {
                const Icon = card.icon;
                const isFeatured = card.featured;
                return (
                  <Card
                    key={card.path}
                    onClick={() => navigate(cabinetPath(card.path))}
                    className={cn(
                      "group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 overflow-hidden relative",
                      isFeatured
                        ? "border-gold/50 bg-gradient-to-br from-gold/10 via-paper to-paper-deep/30 hover:shadow-accent"
                        : "border-border bg-card hover:shadow-medium",
                    )}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className={cn(
                            "h-11 w-11 rounded-xl flex items-center justify-center transition-colors",
                            isFeatured
                              ? "bg-gold-deep text-paper shadow-sm"
                              : "bg-muted text-foreground group-hover:bg-gold/15 group-hover:text-gold-deep",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {card.tag && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-gold-deep bg-gold/10 px-1.5 py-0.5 rounded">
                            {card.tag}
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                        {card.title}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {card.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* ── Инбокс уведомлений — сперва то, что требует внимания ───── */}
          {!isDemoMode && (
            <div className="mb-5">
              <NotificationsInbox />
            </div>
          )}

          {/* ── План дела — «что делать дальше» ────────────────────────── */}
          <div className="mb-5">
            <CasePlanCard />
          </div>

          {/* ── Пробный период — таймер обратного отсчёта ──────────────── */}
          {!isDemoMode && (
            <div className="mb-5">
              <TrialCountdownCard />
            </div>
          )}

          {/* ── AI-сводка по делу — главный блок ───────────────────────── */}
          {!isDemoMode && (
            <div className="mb-5">
              <AICaseSummary />
            </div>
          )}

          {/* ── Роадмап (компактнее, после сводки) ─────────────────────── */}
          {!isDemoMode && (
            <div className="mb-6">
              <CaseRoadmap />
            </div>
          )}

          {/* ── Статус дела у юриста глазами клиента (этап + эскалация) ──── */}
          {!isDemoMode && !isLawyer && (
            <div className="mb-6">
              <ClientCaseStatusCard />
            </div>
          )}

          {/* ── Подписка (рядом со статусом дела) ──────────────────────── */}
          <div className="mb-6">
            <SubscriptionStatusCard />
          </div>

          {/* ── Запросы от юристов (одна кнопка «Принять») ──────────────── */}
          {!isDemoMode && !isLawyer && (
            <div className="mb-6">
              <ClientLawyerRequests />
            </div>
          )}

          {/* Подключение к юристу — client-initiated: клиент находит юриста в
              каталоге /lawyers (или по ссылке юриста) и включает доступ тумблером.
              Кодов/индивидуальных номеров больше нет. */}

          {/* ── Мои юристы: тумблер доступа к данным + визитка ──────────────
              Показывается только если у клиента уже есть юристы (иначе компонент
              рендерит null). Подключение к новому юристу — в каталоге /lawyers. */}
          {!isDemoMode && !isLawyer && (
            <ShareWithLawyer />
          )}

          {/* ── Юристы (без дубля «Кабинет юриста» из футера) ──────────── */}
          {!isDemoMode && !isLawyer && (
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => navigate("/lawyers")}
                className="cursor-pointer rounded-xl border border-gold/40 bg-gradient-to-br from-gold/5 to-paper-deep/20 px-4 py-3.5 flex items-center gap-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gold group"
              >
                <div className="flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center bg-gold/15 text-gold-deep group-hover:bg-gold/25 transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">Найти юриста</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Каталог · защищённый чат до договора
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 group-hover:text-gold-deep transition-colors" />
              </div>

              <div
                onClick={() => navigate(cabinetPath("/client/messages"))}
                className={cn(
                  "cursor-pointer rounded-xl border px-4 py-3.5 flex items-center gap-3.5",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                  unreadCount > 0
                    ? "border-seal/40 bg-seal/5"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <div className={cn(
                  "relative flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center",
                  unreadCount > 0
                    ? "bg-seal text-paper shadow-sm"
                    : "bg-muted text-muted-foreground group-hover:bg-gold/15 group-hover:text-gold-deep transition-colors",
                )}>
                  <Briefcase className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-seal text-paper text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-semibold text-sm", unreadCount > 0 ? "text-seal" : "text-foreground")}>
                    Мои чаты с юристами
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {unreadCount > 0
                      ? "Юрист написал — нажмите, чтобы ответить"
                      : "История переписки"}
                  </p>
                </div>
                <ChevronRight className={cn("h-4 w-4 flex-shrink-0 transition-colors", unreadCount > 0 ? "text-seal" : "text-muted-foreground/50 group-hover:text-gold-deep")} />
              </div>
            </div>
          )}

          {/* ── Инструменты — свёрнуты по умолчанию: разгружаем длинный
                 скролл главной, всё то же есть в боковом меню/«Ещё» ───────── */}
          <Collapsible className="mb-8">
            <CollapsibleTrigger className="group/sec flex w-full items-center gap-2 mb-3">
              <span className="section-number">Инструменты</span>
              <span className="text-[11px] text-muted-foreground">· {toolsCards.length}</span>
              <span className="flex-1 h-px bg-border/50" />
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/sec:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {toolsCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.path}
                    onClick={() => navigate(cabinetPath(card.path))}
                    className="group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft border-border"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-gold/15 transition-colors">
                          <Icon className="h-4 w-4 text-foreground group-hover:text-gold-deep transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground">{card.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {card.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Сообщество — тоже свёрнуто по умолчанию ────────────────── */}
          <Collapsible className="mb-8">
            <CollapsibleTrigger className="group/sec flex w-full items-center gap-2 mb-3">
              <span className="section-number">Сообщество</span>
              <span className="text-[11px] text-muted-foreground">· {communityCards.length}</span>
              <span className="flex-1 h-px bg-border/50" />
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/sec:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {communityCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.path}
                    onClick={() => navigate(card.path)}
                    className="group cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft border-border"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-gold/15 transition-colors">
                          <Icon className="h-4 w-4 text-foreground group-hover:text-gold-deep transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground">{card.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {card.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Семейный доступ — мини-CTA ─────────────────────────────── */}
          {!isDemoMode && (
            <div className="mb-8">
              <Card
                 onClick={() => navigate(cabinetPath("/family"))}
                 className="cursor-pointer border-gold/30 bg-gradient-to-br from-gold/5 to-card hover:border-gold/50 transition-colors group"
               >
                 <CardContent className="p-4 flex items-start gap-3">
                   <div className="h-10 w-10 rounded-lg bg-gold/15 flex items-center justify-center group-hover:bg-gold/25 transition-colors">
                     <Users className="h-4 w-4 text-gold-deep transition-colors" />
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="font-semibold text-sm text-foreground">Семья как второй контур контроля</p>
                     <p className="text-xs text-muted-foreground leading-relaxed">
                       Родители или близкие видят план, дедлайны и могут помогать с оплатой.
                       Медицинские данные открываются только в выбранных рамках.
                     </p>
                   </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Админ-секция ───────────────────────────────────────────── */}
          {isAdmin && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="h-4 w-4 text-seal" />
                <span className="section-number text-seal">Администрирование</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {adminCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card
                      key={card.path}
                      onClick={() => navigate(card.path)}
                      className="cursor-pointer hover:shadow-soft transition-all border-seal/20 bg-seal/[0.02]"
                    >
                      <CardContent className="p-3 text-center">
                        <Icon className="h-4 w-4 text-seal mx-auto mb-1.5" />
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

export default DashboardPage;
