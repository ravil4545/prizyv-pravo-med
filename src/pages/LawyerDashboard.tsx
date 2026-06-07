import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, User, AlertTriangle, Trophy, TrendingUp,
  Plus, ChevronRight, Crown, Briefcase, MessageSquare, FileText, BookOpen,
  LogOut, Settings, Palette, CalendarClock, Flag, ListChecks, Stethoscope,
} from "lucide-react";
import { loadAgendaItems, type AgendaItem, type AgendaKind } from "@/lib/lawyerAgendaData";
import { deadlineBucket, deadlineToneClass, formatDueLabel } from "@/lib/deadlines";
import DiseaseScheduleDrawer from "@/components/DiseaseScheduleDrawer";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import {
  CRM_STAGE_LABELS, CRM_STAGE_ORDER, CRM_STAGE_BAR_CLASS, getStageDef,
} from "@/lib/crmStages";
import { cn } from "@/lib/utils";
import LawyerUpgradeDialog from "@/components/LawyerUpgradeDialog";

interface StageCount { stage: string; count: number }
interface RecentClient {
  id: string; client_name: string; client_phone: string | null;
  crm_stage: string; priority: string; updated_at: string;
}

const KIND_ICON: Record<AgendaKind, typeof Flag> = {
  conscription: Flag,
  action: ListChecks,
  exam: Stethoscope,
};

const LawyerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, isLawyer, isPro } = useLawyerProfile();
  const { unreadCount } = useUnreadMessages();

  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [wonCount, setWonCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [deadlines, setDeadlines] = useState<AgendaItem[]>([]);

  useEffect(() => {
    if (profileLoading) return;
    // Не залогинен — на авторизацию с возвратом сюда
    if (!user) { navigate("/auth?next=/lawyer", { replace: true }); return; }
    // Залогинен, но не юрист — на обычный кабинет
    if (!isLawyer) { navigate("/dashboard", { replace: true }); return; }
    loadStats();
    loadDeadlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileLoading, isLawyer]);

  // Ближайшие сроки по всем делам (P4): просроченные/скорые сверху, топ-5.
  const loadDeadlines = async () => {
    const items = await loadAgendaItems(user!.id);
    items.sort((a, b) => a.date.localeCompare(b.date));
    setDeadlines(items.slice(0, 5));
  };

  // Считаем агрегаты count-запросами (head: true — строки не тянем), а не
  // вытягиванием всей таблицы. При росте базы у Pro-юриста (лимит клиентов
  // снят) полный select деградировал; теперь нагрузка O(1) по объёму данных.
  const loadStats = async () => {
    // База: count по строкам юриста; build добавляет фильтр конкретной метрики.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- цепочка query-builder без сгенерированного типа
    const countClients = (build?: (q: any) => any) => {
      const q = supabase
        .from("lawyer_clients")
        .select("*", { count: "exact", head: true })
        .eq("lawyer_id", user!.id);
      return build ? build(q) : q;
    };

    const [totalRes, urgentRes, wonRes, recentRes, ...stageRes] = await Promise.all([
      countClients(),
      countClients((q) => q.eq("priority", "urgent")),
      countClients((q) => q.eq("case_won", true)),
      supabase
        .from("lawyer_clients")
        .select("id, client_name, client_phone, crm_stage, priority, updated_at")
        .eq("lawyer_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(6),
      ...CRM_STAGE_ORDER.map((stage) => countClients((q) => q.eq("crm_stage", stage))),
    ]);

    setTotalClients(totalRes.count ?? 0);
    setUrgentCount(urgentRes.count ?? 0);
    setWonCount(wonRes.count ?? 0);
    setRecentClients((recentRes.data as RecentClient[]) || []);

    // Воронка и счётчик «активных этапов» — только этапы с count > 0.
    const counts: StageCount[] = [];
    CRM_STAGE_ORDER.forEach((stage, i) => {
      const c = stageRes[i].count ?? 0;
      if (c > 0) counts.push({ stage, count: c });
    });
    setStageCounts(counts);
    setDataLoading(false);
  };

  // Загрузка профиля либо ожидание редиректа (не залогинен / не юрист) — показываем skeleton,
  // чтобы пользователь не видел вспышку белого экрана
  if (profileLoading || !user || !isLawyer) return (
    <div className="min-h-screen bg-background"><Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </main>
    </div>
  );

  const usedClients = totalClients;
  const clientLimit = profile?.clients_limit ?? 5;
  const limitPercent = Math.min(100, Math.round((usedClients / clientLimit) * 100));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" />
              Кабинет юриста
            </h1>
            <p className="text-muted-foreground mt-1">
              {profile?.full_name || user?.email} · {isPro ? "Pro" : "Basic"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <DiseaseScheduleDrawer>
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Расписание болезней
              </Button>
            </DiseaseScheduleDrawer>
            <Button variant="outline" asChild><Link to="/lawyer/templates"><FileText className="h-4 w-4 mr-2" />Шаблоны</Link></Button>
            <Button asChild><Link to="/lawyer/clients"><Plus className="h-4 w-4 mr-2" />Добавить клиента</Link></Button>

            {/* Меню аккаунта юриста — настройки бренда / выход */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Меню аккаунта">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {profile?.full_name || user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/lawyer/branding")}>
                  <Briefcase className="h-4 w-4 mr-2" />
                  Мой бренд
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="h-4 w-4 mr-2" />
                  Профиль и удаление
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Subscription banner (basic only) */}
        {!isPro && (
          <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium text-sm">Тариф Basic — {usedClients}/{clientLimit} клиентов</p>
                  <div className="mt-1 h-1.5 w-48 bg-amber-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${limitPercent}%` }} />
                  </div>
                </div>
              </div>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => setUpgradeOpen(true)}>
                Upgrade до Pro
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Всего клиентов", value: totalClients, icon: Users, color: "text-blue-500" },
            { label: "Срочных дел", value: urgentCount, icon: AlertTriangle, color: "text-red-500" },
            { label: "Выигранных дел", value: wonCount, icon: Trophy, color: "text-green-500" },
            { label: "Активных этапов", value: stageCounts.length, icon: TrendingUp, color: "text-purple-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{dataLoading ? "—" : value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ближайшие сроки — сводка дедлайнов по всем делам (P4). Виден, только
            если есть хотя бы один срок; полная картина — на /lawyer/agenda. */}
        {!dataLoading && deadlines.length > 0 && (
          <Card className="mb-8 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-primary" />
                Ближайшие сроки
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" asChild>
                <Link to="/lawyer/agenda">Все сроки <ChevronRight className="ml-0.5 h-3.5 w-3.5" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {deadlines.map((item) => {
                const bucket = deadlineBucket(item.date);
                const tone = bucket ? deadlineToneClass(bucket) : "text-muted-foreground";
                const Icon = KIND_ICON[item.kind];
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/lawyer/clients/${item.clientId}`)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.clientName}</p>
                    </div>
                    <span className={cn("flex-shrink-0 text-xs font-medium", tone)}>
                      {formatDueLabel(item.date)}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Pipeline — горизонтальные прогресс-бары, чтобы было видно «куда уходят клиенты» */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Воронка этапов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {dataLoading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                : stageCounts.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-4">Нет клиентов</p>
                  : (() => {
                      const ordered = [...stageCounts].sort(
                        (a, b) => CRM_STAGE_ORDER.indexOf(a.stage as never) - CRM_STAGE_ORDER.indexOf(b.stage as never),
                      );
                      const maxCount = Math.max(1, ...ordered.map((s) => s.count));
                      return ordered.map(({ stage, count }) => {
                        const def = getStageDef(stage);
                        const Icon = def?.icon;
                        const pct = Math.round((count / maxCount) * 100);
                        return (
                          <button
                            key={stage}
                            className="w-full text-left group"
                            onClick={() => navigate(`/lawyer/clients?stage=${stage}`)}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground truncate">
                                {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
                                <span className="truncate">{def?.label || stage}</span>
                              </span>
                              <span className="font-semibold ml-2 flex-shrink-0">{count}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all group-hover:opacity-90",
                                  CRM_STAGE_BAR_CLASS[stage] || "bg-primary",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </button>
                        );
                      });
                    })()}
              <Button variant="outline" className="w-full mt-2" asChild>
                <Link to="/lawyer/clients">Все клиенты <ChevronRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>

          {/* Recent clients */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Последняя активность</CardTitle>
            </CardHeader>
            <CardContent>
              {dataLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full mb-2" />)
                : recentClients.length === 0
                  ? (
                      <div className="text-center py-8">
                        <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">Нет клиентов. Добавьте первого.</p>
                        <Button className="mt-4" asChild><Link to="/lawyer/clients">Добавить клиента</Link></Button>
                      </div>
                    )
                  : recentClients.map((c) => (
                      <div key={c.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => navigate(`/lawyer/clients/${c.id}`)}>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{c.client_name}</p>
                          <p className="text-xs text-muted-foreground">{CRM_STAGE_LABELS[c.crm_stage] || c.crm_stage}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {c.priority === "urgent" && <Badge variant="destructive" className="text-xs">Срочно</Badge>}
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); navigate(`/lawyer/chat/${c.id}`); }}>
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick nav — 5 равноценных карточек, на десктопе в одну строку.
            Цвет иконки/тинта подсказывает раздел (для быстрого распознавания «куда я иду»). */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
          {[
            { to: "/lawyer/clients",   icon: Users,         label: "CRM — Клиенты", desc: "Ведение дел",            badge: 0,            color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30" },
            { to: "/lawyer/templates", icon: FileText,      label: "Шаблоны",       desc: "DOCX / PDF",             badge: 0,            color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30" },
            { to: "/lawyer/chats",     icon: MessageSquare, label: "Чаты",          desc: "Переписка с клиентами",  badge: unreadCount,  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { to: "/lawyer/analytics", icon: TrendingUp,    label: "Аналитика",     desc: "Статистика дел",         badge: 0,            color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30" },
            { to: "/lawyer/branding",  icon: Palette,       label: "Мой бренд",     desc: "Личное приложение и QR", badge: 0,            color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/30" },
          ].map(({ to, icon: Icon, label, desc, badge, color, bg }) => (
            <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow relative" onClick={() => navigate(to)}>
              <CardContent className="p-4 text-center">
                {badge > 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                <div className={cn("inline-flex items-center justify-center h-12 w-12 rounded-2xl mb-2", bg)}>
                  <Icon className={cn("h-6 w-6", color)} />
                </div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Подсказки юристу — что упростит работу */}
        <Card className="mt-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-primary mb-2">💡 Подсказки</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>В карточке клиента есть кнопка <strong>«Из шаблона»</strong> — поля документа подставятся автоматически.</li>
              <li>Кнопка <strong>«Расписание болезней»</strong> вверху открывает справочник без ухода со страницы.</li>
              <li>Для клиентов без аккаунта на сайте можно загружать медкарты прямо в карточке (вкладка «Документы»).</li>
              <li>Brand-страница <strong>/u/{profile?.user_id ? "ваш-slug" : "..."}</strong> — отдельный лендинг, не копия основного сайта. Шаблон визуала меняется в «Мой бренд».</li>
            </ul>
          </CardContent>
        </Card>
      </main>
      <Footer />

      <LawyerUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentTier={isPro ? "pro" : "basic"}
      />
    </div>
  );
};

export default LawyerDashboard;
