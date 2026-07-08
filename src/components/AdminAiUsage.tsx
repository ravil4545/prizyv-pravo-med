/* eslint-disable @typescript-eslint/no-explicit-any -- ai_usage_events ещё не в автосгенерированных типах */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Users, Bot } from "lucide-react";

// Раздел «Расход ИИ»: сколько тратим на LLM-токены, кто больше всех расходует,
// сколько анонимных вызовов (публичный /ai + прямые запросы без входа).
// Источник — ai_usage_events (леджер, пишут edge-функции chat/chat-rag,
// см. supabase/functions/_shared/aiUsage.ts). Ориентир — 1650₽/мес на
// подписчика при подписке 4990₽; выше этого порога модель уже деградирует
// на бэкенде (AI_MONTHLY_BUDGET_RUB), но реальные счета провайдера стоит
// сверять отдельно — цены в aiUsage.ts приблизительные.
const MONTHLY_BUDGET_RUB = 1650;

interface UsageRow {
  user_id: string | null;
  ip_hash: string | null;
  function_name: string;
  model: string;
  cost_rub: number;
}

interface SpenderStat {
  key: string;
  label: string;
  costRub: number;
  requests: number;
}

export default function AdminAiUsage() {
  const [loading, setLoading] = useState(true);
  const [totalMonthRub, setTotalMonthRub] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [anonRequests, setAnonRequests] = useState(0);
  const [topSpenders, setTopSpenders] = useState<SpenderStat[]>([]);
  const [byModel, setByModel] = useState<{ model: string; costRub: number; requests: number }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const { data } = await (supabase as any)
        .from("ai_usage_events")
        .select("user_id, ip_hash, function_name, model, cost_rub")
        .gte("created_at", monthStart.toISOString())
        .limit(20000);

      const rows = (data as UsageRow[]) || [];
      setTotalRequests(rows.length);
      setTotalMonthRub(rows.reduce((s, r) => s + Number(r.cost_rub), 0));
      setAnonRequests(rows.filter((r) => !r.user_id).length);

      const userMap = new Map<string, { costRub: number; requests: number }>();
      const modelMap = new Map<string, { costRub: number; requests: number }>();
      rows.forEach((r) => {
        const key = r.user_id || `anon:${r.ip_hash}`;
        const cur = userMap.get(key) || { costRub: 0, requests: 0 };
        cur.costRub += Number(r.cost_rub);
        cur.requests += 1;
        userMap.set(key, cur);

        const mCur = modelMap.get(r.model) || { costRub: 0, requests: 0 };
        mCur.costRub += Number(r.cost_rub);
        mCur.requests += 1;
        modelMap.set(r.model, mCur);
      });

      const top = Array.from(userMap, ([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.costRub - a.costRub)
        .slice(0, 15);

      const userIds = top.filter((t) => !t.key.startsWith("anon:")).map((t) => t.key);
      const profileMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        (profiles || []).forEach((p: any) => { if (p.full_name) profileMap.set(p.id, p.full_name); });
      }

      setTopSpenders(
        top.map((t) => ({
          key: t.key,
          label: t.key.startsWith("anon:") ? "Аноним (IP)" : profileMap.get(t.key) || t.key.slice(0, 8),
          costRub: t.costRub,
          requests: t.requests,
        })),
      );
      setByModel(Array.from(modelMap, ([model, v]) => ({ model, ...v })).sort((a, b) => b.costRub - a.costRub));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Расход за месяц</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMonthRub.toFixed(0)}₽</div>
            <p className="mt-1 text-xs text-muted-foreground">Ориентир на подписчика: {MONTHLY_BUDGET_RUB}₽/мес</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Запросов к ИИ</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRequests}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Из них анонимных</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{anonRequests}</div>
            <p className="mt-1 text-xs text-muted-foreground">Публичный /ai + вызовы без входа</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Топ по расходу — этот месяц</CardTitle>
              <CardDescription>Красным — превышение ориентира {MONTHLY_BUDGET_RUB}₽</CardDescription>
            </CardHeader>
            <CardContent>
              {topSpenders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Нет данных за период</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Кто</TableHead>
                      <TableHead className="text-right">Запросов</TableHead>
                      <TableHead className="text-right">₽</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSpenders.map((u) => (
                      <TableRow key={u.key}>
                        <TableCell className="max-w-[180px] truncate text-sm" title={u.key}>{u.label}</TableCell>
                        <TableCell className="text-right font-mono">{u.requests}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${u.costRub > MONTHLY_BUDGET_RUB ? "text-destructive" : ""}`}>
                          {u.costRub.toFixed(1)}₽
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Расход по моделям</CardTitle>
              <CardDescription>Этот месяц</CardDescription>
            </CardHeader>
            <CardContent>
              {byModel.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Нет данных за период</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Модель</TableHead>
                      <TableHead className="text-right">Запросов</TableHead>
                      <TableHead className="text-right">₽</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byModel.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell className="font-mono text-sm">{m.model}</TableCell>
                        <TableCell className="text-right font-mono">{m.requests}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{m.costRub.toFixed(1)}₽</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
