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
  Users, AlertTriangle, Trophy, TrendingUp,
  Plus, ChevronRight, Crown, Briefcase, MessageSquare, FileText, BookOpen,
} from "lucide-react";
import DiseaseScheduleDrawer from "@/components/DiseaseScheduleDrawer";

const CRM_STAGE_LABELS: Record<string, string> = {
  initial_contact: "Первичный контакт",
  no_diagnosis: "Нет диагноза",
  has_diagnosis: "Есть диагноз",
  examinations: "Обследования",
  diagnosis_confirmed: "Диагноз получен",
  waiting_documents: "Ожидание документов",
  documents_received: "Документы получены",
  military_office: "Военкомат",
  regional_commission: "Комиссия субъекта",
  courts: "Суды",
  military_ticket: "Получение ВБ",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "destructive",
  high: "secondary",
  normal: "outline",
  low: "outline",
};

interface StageCount { stage: string; count: number }
interface RecentClient {
  id: string; client_name: string; client_phone: string | null;
  crm_stage: string; priority: string; updated_at: string;
}

const LawyerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, isLawyer, isPro } = useLawyerProfile();

  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const [wonCount, setWonCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadStats();
  }, [user, profileLoading, isLawyer]);

  const loadStats = async () => {
    const { data: clients } = await supabase
      .from("lawyer_clients")
      .select("id, client_name, client_phone, crm_stage, priority, updated_at, case_won")
      .eq("lawyer_id", user!.id)
      .order("updated_at", { ascending: false });

    if (!clients) { setDataLoading(false); return; }

    setTotalClients(clients.length);
    setUrgentCount(clients.filter((c) => c.priority === "urgent").length);
    setWonCount(clients.filter((c) => c.case_won).length);
    setRecentClients(clients.slice(0, 6) as RecentClient[]);

    const counts: Record<string, number> = {};
    clients.forEach((c) => { counts[c.crm_stage] = (counts[c.crm_stage] || 0) + 1; });
    setStageCounts(Object.entries(counts).map(([stage, count]) => ({ stage, count })));
    setDataLoading(false);
  };

  if (profileLoading) return (
    <div className="min-h-screen bg-background"><Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </main>
    </div>
  );

  if (!isLawyer) return null;

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
          <div className="flex gap-2 flex-wrap">
            <DiseaseScheduleDrawer>
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Расписание болезней
              </Button>
            </DiseaseScheduleDrawer>
            <Button variant="outline" asChild><Link to="/lawyer/templates"><FileText className="h-4 w-4 mr-2" />Шаблоны</Link></Button>
            <Button asChild><Link to="/lawyer/clients"><Plus className="h-4 w-4 mr-2" />Добавить клиента</Link></Button>
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
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
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

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Pipeline */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Воронка этапов</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dataLoading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                : stageCounts.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-4">Нет клиентов</p>
                  : stageCounts
                      .sort((a, b) => b.count - a.count)
                      .map(({ stage, count }) => (
                        <div key={stage} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted cursor-pointer"
                          onClick={() => navigate(`/lawyer/clients?stage=${stage}`)}>
                          <span className="text-sm truncate">{CRM_STAGE_LABELS[stage] || stage}</span>
                          <Badge variant="secondary" className="ml-2 flex-shrink-0">{count}</Badge>
                        </div>
                      ))}
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

        {/* Quick nav */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { to: "/lawyer/clients",   icon: Users,          label: "CRM — Клиенты", desc: "Ведение дел" },
            { to: "/lawyer/templates", icon: FileText,        label: "Шаблоны",       desc: "Документы" },
            { to: "/lawyer/chats",     icon: MessageSquare,  label: "Чаты",          desc: "Переписка с клиентами" },
            { to: "/lawyer/analytics", icon: TrendingUp,     label: "Аналитика",     desc: "Статистика дел" },
          ].map(({ to, icon: Icon, label, desc }) => (
            <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(to)}>
              <CardContent className="p-4 text-center">
                <Icon className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LawyerDashboard;
