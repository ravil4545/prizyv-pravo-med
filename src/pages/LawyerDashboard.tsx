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
  Users, User, AlertTriangle, Trophy,
  Plus, ChevronRight, Crown, Briefcase, MessageSquare, FileText, BookOpen,
  LogOut, Settings, CalendarClock, Flag, ListChecks, Stethoscope, BellRing,
  Files, CircleCheckBig,
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
interface EscalatedClient { id: string; client_name: string; escalated_at: string | null }
interface DocumentAttention {
  clientId: string;
  clientName: string;
  title: string;
  count: number;
  newestAt: string;
  reason: string;
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
  const [escalationCount, setEscalationCount] = useState(0);
  const [escalatedClients, setEscalatedClients] = useState<EscalatedClient[]>([]);
  const [documentAttention, setDocumentAttention] = useState<DocumentAttention[]>([]);
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

  // Все активные сроки нужны action-first очереди; в UI показываем только первые.
  const loadDeadlines = async () => {
    const items = await loadAgendaItems(user!.id);
    items.sort((a, b) => a.date.localeCompare(b.date));
    setDeadlines(items);
  };

  const loadDocumentAttention = async (rows: Array<{
    id: string;
    client_name: string;
    client_user_id: string | null;
  }>) => {
    if (rows.length === 0) { setDocumentAttention([]); return; }

    const clientIds = rows.map((row) => row.id);
    const userIds = rows.flatMap((row) => row.client_user_id ? [row.client_user_id] : []);
    const clientById = new Map(rows.map((row) => [row.id, row]));
    const clientByUser = new Map(rows.flatMap((row) => row.client_user_id ? [[row.client_user_id, row] as const] : []));

    const [{ data: analysisNotes }, { data: lawyerDocs }] = await Promise.all([
      supabase
        .from("case_notes")
        .select("lawyer_client_id, created_at")
        .in("lawyer_client_id", clientIds)
        .eq("note_type", "ai_analysis")
        .order("created_at", { ascending: false }),
      supabase
        .from("lawyer_client_med_docs")
        .select("id, lawyer_client_id, title, created_at, ai_fitness_category")
        .in("lawyer_client_id", clientIds),
    ]);

    const latestAnalysis = new Map<string, string>();
    for (const note of analysisNotes || []) {
      if (!latestAnalysis.has(note.lawyer_client_id)) latestAnalysis.set(note.lawyer_client_id, note.created_at);
    }

    const docsByClient = new Map<string, Array<{
      title: string;
      createdAt: string;
      analyzed: boolean;
    }>>();
    const addDoc = (clientId: string, title: string | null, createdAt: string | null, analyzed: boolean) => {
      if (!createdAt) return;
      const docs = docsByClient.get(clientId) || [];
      docs.push({ title: title || "Документ без названия", createdAt, analyzed });
      docsByClient.set(clientId, docs);
    };

    for (const doc of lawyerDocs || []) {
      addDoc(doc.lawyer_client_id, doc.title, doc.created_at, Boolean(doc.ai_fitness_category));
    }

    if (userIds.length > 0) {
      const { data: accountDocs } = await supabase
        .from("medical_documents_v2")
        .select("id, user_id, title, created_at, uploaded_at, ai_fitness_category")
        .in("user_id", userIds);
      for (const doc of accountDocs || []) {
        const owner = clientByUser.get(doc.user_id);
        if (!owner) continue;
        addDoc(owner.id, doc.title, doc.created_at || doc.uploaded_at, Boolean(doc.ai_fitness_category));
      }
    }

    const attention: DocumentAttention[] = [];
    for (const [clientId, docs] of docsByClient) {
      const client = clientById.get(clientId);
      if (!client || docs.length === 0) continue;
      const lastAnalysis = latestAnalysis.get(clientId);
      const sorted = [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const newer = lastAnalysis ? sorted.filter((doc) => doc.createdAt > lastAnalysis) : sorted;
      const withoutAnalysis = sorted.filter((doc) => !doc.analyzed);
      if (newer.length === 0 && withoutAnalysis.length === 0) continue;

      const affected = new Map([...newer, ...withoutAnalysis].map((doc) => [`${doc.title}:${doc.createdAt}`, doc]));
      const reason = !lastAnalysis
        ? "Нет сохранённого брифа по документам"
        : newer.length > 0
        ? "Документы новее последнего брифа"
        : "Есть документы без AI-разбора";
      attention.push({
        clientId,
        clientName: client.client_name,
        title: sorted[0].title,
        count: affected.size,
        newestAt: sorted[0].createdAt,
        reason,
      });
    }

    attention.sort((a, b) => b.newestAt.localeCompare(a.newestAt));
    setDocumentAttention(attention);
  };

  // Один GET всех клиентов юриста → агрегаты считаем на клиенте. Раньше тут
  // было ~16 параллельных count-запросов (head:true) на каждый этап/метрику;
  // на проде этот «веер» упирался в лимит пулера Supabase и стабильно отдавал
  // 503 (нужные цифры всё равно приходили из соседнего полного GET для лент и
  // сроков — count-запросы были и избыточны, и падали). Для реального числа
  // клиентов одного юриста выборка дешёвая.
  const loadStats = async () => {
    const { data } = await supabase
      .from("lawyer_clients")
      .select("id, client_name, client_phone, client_user_id, crm_stage, priority, case_won, escalation_requested, escalated_at, updated_at")
      .eq("lawyer_id", user!.id);
    const rows = data ?? [];

    setTotalClients(rows.length);
    setUrgentCount(rows.filter((r) => r.priority === "urgent").length);
    setWonCount(rows.filter((r) => r.case_won === true).length);
    setEscalationCount(rows.filter((r) => r.escalation_requested === true).length);
    setEscalatedClients(rows
      .filter((row) => row.escalation_requested === true)
      .sort((a, b) => (b.escalated_at || b.updated_at || "").localeCompare(a.escalated_at || a.updated_at || ""))
      .map((row) => ({ id: row.id, client_name: row.client_name, escalated_at: row.escalated_at })));
    await loadDocumentAttention(rows);

    // «Последняя активность» — топ-6 по updated_at (сортируем на клиенте).
    const recent = [...rows]
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
      .slice(0, 6);
    setRecentClients(recent as RecentClient[]);

    // Воронка и счётчик «активных этапов» — только этапы с count > 0.
    const stageCountMap = new Map<string, number>();
    for (const r of rows) {
      stageCountMap.set(r.crm_stage, (stageCountMap.get(r.crm_stage) || 0) + 1);
    }
    const counts: StageCount[] = [];
    CRM_STAGE_ORDER.forEach((stage) => {
      const c = stageCountMap.get(stage) || 0;
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
  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const overdueDeadlines = deadlines.filter((item) => item.date < todayKey);
  const upcomingDeadlines = deadlines.filter((item) => item.date >= todayKey);
  const attentionCount = unreadCount + escalationCount + overdueDeadlines.length + documentAttention.length;

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

        {/* Action-first: сначала то, что требует решения сегодня, статистика — ниже. */}
        <Card className="mb-8 border-primary/25">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BellRing className="h-5 w-5 text-primary" />
                  Требует внимания
                  {!dataLoading && attentionCount > 0 && <Badge variant="destructive">{attentionCount}</Badge>}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Очередь сообщений, сроков, документов и AI-эскалаций</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/lawyer/agenda">Открыть календарь <ChevronRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {([
                {
                  label: "Непрочитанные",
                  value: unreadCount,
                  detail: unreadCount > 0 ? "Ответить клиентам" : "Новых сообщений нет",
                  icon: MessageSquare,
                  color: "text-emerald-600",
                  to: "/lawyer/chats",
                  active: unreadCount > 0,
                },
                {
                  label: "Просроченные сроки",
                  value: overdueDeadlines.length,
                  detail: upcomingDeadlines.length > 0 ? `Ещё ${upcomingDeadlines.length} впереди` : "Активных сроков нет",
                  icon: CalendarClock,
                  color: "text-red-600",
                  to: "/lawyer/agenda",
                  active: overdueDeadlines.length > 0,
                },
                {
                  label: "Документы к проверке",
                  value: documentAttention.length,
                  detail: documentAttention.length > 0 ? "Обновить брифы дел" : "Новых документов нет",
                  icon: Files,
                  color: "text-amber-600",
                  to: documentAttention[0] ? `/lawyer/clients/${documentAttention[0].clientId}` : "/lawyer/clients",
                  active: documentAttention.length > 0,
                },
                {
                  label: "AI-эскалации",
                  value: escalationCount,
                  detail: escalationCount > 0 ? "Клиенты ждут юриста" : "Запросов нет",
                  icon: BellRing,
                  color: "text-rose-600",
                  to: "/lawyer/clients?escalated=1",
                  active: escalationCount > 0,
                },
              ] as const).map(({ label, value, detail, icon: Icon, color, to, active }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => navigate(to)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors hover:bg-muted/60",
                    active && "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon className={cn("h-4 w-4", color)} />
                    <span className="text-xl font-bold">{dataLoading ? "—" : value}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold">{label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Сроки по приоритету</p>
                  <Link to="/lawyer/agenda" className="text-xs text-primary hover:underline">Все сроки</Link>
                </div>
                <div className="space-y-1">
                  {dataLoading
                    ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)
                    : deadlines.length === 0
                    ? <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Активных сроков нет.</p>
                    : deadlines.slice(0, 5).map((item) => {
                        const bucket = deadlineBucket(item.date);
                        const tone = bucket ? deadlineToneClass(bucket) : "text-muted-foreground";
                        const Icon = KIND_ICON[item.kind];
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(`/lawyer/clients/${item.clientId}`)}
                            className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
                          >
                            <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{item.clientName}</p>
                            </div>
                            <span className={cn("flex-shrink-0 text-xs font-medium", tone)}>{formatDueLabel(item.date)}</span>
                          </button>
                        );
                      })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Дела для проверки</p>
                <div className="space-y-1">
                  {escalatedClients.slice(0, 3).map((item) => (
                    <button key={`escalation-${item.id}`} type="button" onClick={() => navigate(`/lawyer/clients/${item.id}`)} className="flex w-full items-center gap-3 rounded-lg bg-rose-50 p-2 text-left transition-colors hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30">
                      <BellRing className="h-4 w-4 flex-shrink-0 text-rose-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.client_name}</p>
                        <p className="text-xs text-rose-700 dark:text-rose-300">Запросил живого юриста</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {documentAttention.slice(0, Math.max(2, 5 - escalatedClients.length)).map((item) => (
                    <button key={`doc-${item.clientId}`} type="button" onClick={() => navigate(`/lawyer/clients/${item.clientId}`)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted">
                      <Files className="h-4 w-4 flex-shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.clientName} · {item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.reason}{item.count > 1 ? ` · ${item.count} док.` : ""}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {!dataLoading && escalatedClients.length === 0 && documentAttention.length === 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                      <CircleCheckBig className="h-4 w-4 text-emerald-600" /> Новых документов и эскалаций нет.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Полезная статистика остаётся, но не оттесняет рабочую очередь. */}
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            { label: "Всего клиентов", value: totalClients, icon: Users, color: "text-blue-500" },
            { label: "Срочных дел", value: urgentCount, icon: AlertTriangle, color: "text-red-500" },
            { label: "Выигранных дел", value: wonCount, icon: Trophy, color: "text-green-500" },
            { label: "Активных этапов", value: stageCounts.length, icon: ListChecks, color: "text-violet-500" },
          ] as const).map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className={cn("rounded-lg bg-muted p-2", color)}><Icon className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{dataLoading ? "—" : value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
