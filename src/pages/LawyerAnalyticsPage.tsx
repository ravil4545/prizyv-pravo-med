import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, Trophy, TrendingUp, AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_STAGES, PRIORITIES } from "@/lib/crmStages";

interface AnalyticsData {
  total: number;
  won: number;
  urgent: number;
  stageMap: Record<string, number>;
  priorityMap: Record<string, number>;
  monthly: { key: string; count: number }[];
}

const EMPTY_ANALYTICS: AnalyticsData = {
  total: 0, won: 0, urgent: 0, stageMap: {}, priorityMap: {}, monthly: [],
};

const LawyerAnalyticsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const [data, setData] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadAnalytics();
  }, [user, profileLoading, isLawyer]);

  // Аналитика считается агрегирующими count-запросами (head: true — строки не
  // тянем) вместо вытягивания всей таблицы lawyer_clients. O(1) по объёму
  // данных: при росте базы у Pro-юриста (лимит клиентов снят) страница раньше
  // деградировала, теперь нагрузка не зависит от числа клиентов.
  const loadAnalytics = async () => {
    const countClients = (build?: (q: any) => any) => {
      const q = supabase
        .from("lawyer_clients")
        .select("*", { count: "exact", head: true })
        .eq("lawyer_id", user!.id);
      return build ? build(q) : q;
    };

    // Последние 6 месяцев — границы [начало месяца, начало следующего).
    const now = new Date();
    const monthRanges = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      return {
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        start: start.toISOString(),
        end: end.toISOString(),
      };
    });

    const [wonRes, stageRes, priorityRes, monthlyRes] = await Promise.all([
      countClients((q) => q.eq("case_won", true)),
      Promise.all(CRM_STAGES.map((s) => countClients((q) => q.eq("crm_stage", s.value)))),
      Promise.all(PRIORITIES.map((p) => countClients((q) => q.eq("priority", p.value)))),
      Promise.all(
        monthRanges.map((m) => countClients((q) => q.gte("created_at", m.start).lt("created_at", m.end))),
      ),
    ]);

    const stageMap: Record<string, number> = {};
    let total = 0;
    CRM_STAGES.forEach((s, i) => {
      const c = stageRes[i].count ?? 0;
      stageMap[s.value] = c;
      total += c;
    });

    const priorityMap: Record<string, number> = {};
    PRIORITIES.forEach((p, i) => { priorityMap[p.value] = priorityRes[i].count ?? 0; });

    setData({
      total,
      won: wonRes.count ?? 0,
      urgent: priorityMap["urgent"] ?? 0,
      stageMap,
      priorityMap,
      monthly: monthRanges.map((m, i) => ({ key: m.key, count: monthlyRes[i].count ?? 0 })),
    });
    setLoading(false);
  };

  if (loading || profileLoading) return (
    <div className="min-h-screen bg-background"><Header />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </main>
    </div>
  );

  const { total, won, urgent, stageMap, priorityMap, monthly } = data;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const maxStage = Math.max(1, ...Object.values(stageMap));
  const maxMonth = Math.max(1, ...monthly.map((m) => m.count));
  const monthLabels: Record<string, string> = {
    "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
    "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
    "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/lawyer"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Аналитика</h1>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Всего клиентов", value: total, icon: Users, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/20" },
            { label: "Срочных дел",    value: urgent, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/20" },
            { label: "Выиграно дел",   value: won,   icon: Trophy, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
            { label: "Конверсия",      value: `${winRate}%`, icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className={cn("p-4 flex items-center gap-3", bg)}>
                <div className={cn("p-2 rounded-lg bg-white/70 dark:bg-black/20", color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Pipeline funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Воронка CRM
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {total === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Нет клиентов</p>
              ) : (
                CRM_STAGES
                  .filter((s) => stageMap[s.value])
                  .sort((a, b) => (stageMap[b.value] || 0) - (stageMap[a.value] || 0))
                  .map((s) => {
                    const count = stageMap[s.value] || 0;
                    const pct = Math.round((count / maxStage) * 100);
                    return (
                      <div key={s.value}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground truncate">{s.label}</span>
                          <span className="font-semibold ml-2 flex-shrink-0">{count}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", s.barClass)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>

          {/* Priority breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Распределение по приоритету
              </CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Нет клиентов</p>
              ) : (
                <div className="space-y-3">
                  {PRIORITIES
                    .filter((p) => priorityMap[p.value])
                    .map(({ value, label, dotClass }) => {
                      const count = priorityMap[value] || 0;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={value} className="flex items-center gap-3">
                          <div className={cn("h-3 w-3 rounded-full flex-shrink-0", dotClass)} />
                          <span className="text-sm text-muted-foreground w-24 flex-shrink-0">{label}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", dotClass)} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-semibold w-10 text-right flex-shrink-0">
                            {count} <span className="text-xs text-muted-foreground font-normal">({pct}%)</span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly new clients */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Новые клиенты (последние 6 месяцев)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-28">
              {monthly.map(({ key, count }) => {
                const pct = Math.round((count / maxMonth) * 100);
                const [, month] = key.split("-");
                return (
                  <div key={key} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">{count || ""}</span>
                    <div className="w-full bg-muted rounded-t-sm overflow-hidden flex items-end" style={{ height: "72px" }}>
                      <div
                        className="w-full bg-primary rounded-t-sm transition-all"
                        style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{monthLabels[month]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default LawyerAnalyticsPage;
