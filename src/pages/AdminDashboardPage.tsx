/* eslint-disable @typescript-eslint/no-explicit-any -- contact_submissions читается динамически */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Crown, Sparkles, Inbox, Star, CheckCircle2, RefreshCw, ChevronRight,
} from "lucide-react";

// Обзорный дашборд админки: ключевые цифры платформы + единая лента входящих
// (заявки с лендинга, клики оплаты, эскалации) с отметкой «обработано».
// Каждая метрика грузится независимо: нет доступа/ошибка → «—», не падаем.

interface Submission {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  status: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  payment_click: { label: "💳 Клик оплаты", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  escalation_notice: { label: "🔴 Эскалация", cls: "border-rose-300 bg-rose-50 text-rose-800" },
  processed: { label: "✓ Обработано", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    users: number | null;
    paid: number | null;
    trials: number | null;
    weekSubmissions: number | null;
    pendingTestimonials: number | null;
  }>({ users: null, paid: null, trials: null, weekSubmissions: null, pendingTestimonials: null });
  const [recent, setRecent] = useState<Submission[]>([]);

  const safeCount = async (run: () => any): Promise<number | null> => {
    try {
      const { count, error } = await run();
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [users, paid, trials, weekSubmissions, pendingTestimonials, recentRes] = await Promise.all([
      safeCount(() => supabase.from("profiles").select("*", { count: "exact", head: true })),
      safeCount(() =>
        supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("is_paid", true),
      ),
      safeCount(() =>
        supabase
          .from("user_subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("is_paid", false)
          .gt("trial_ends_at", nowIso),
      ),
      safeCount(() =>
        (supabase as any)
          .from("contact_submissions")
          .select("*", { count: "exact", head: true })
          .gte("created_at", weekAgo),
      ),
      safeCount(() =>
        supabase.from("testimonials").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ),
      (supabase as any)
        .from("contact_submissions")
        .select("id, name, phone, email, message, status, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    setStats({ users, paid, trials, weekSubmissions, pendingTestimonials });
    setRecent(((recentRes as any)?.data as Submission[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markProcessed = async (id: string) => {
    const { error } = await (supabase as any)
      .from("contact_submissions")
      .update({ status: "processed" })
      .eq("id", id);
    if (error) {
      toast({ title: "Не удалось обновить", description: error.message, variant: "destructive" });
      return;
    }
    setRecent((prev) => prev.map((s) => (s.id === id ? { ...s, status: "processed" } : s)));
  };

  const kpi = [
    { label: "Пользователей", value: stats.users, icon: Users, to: "/admin/users", color: "text-blue-600" },
    { label: "Платных подписок", value: stats.paid, icon: Crown, to: "/admin/users", color: "text-amber-600" },
    { label: "Активных триалов", value: stats.trials, icon: Sparkles, to: "/admin/users", color: "text-violet-600" },
    { label: "Заявок за 7 дней", value: stats.weekSubmissions, icon: Inbox, to: null, color: "text-emerald-600" },
    { label: "Отзывов на модерации", value: stats.pendingTestimonials, icon: Star, to: "/admin/testimonials", color: "text-rose-600" },
  ] as const;

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Обзор</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Состояние платформы и входящие — одним экраном
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          Обновить
        </Button>
      </div>

      {/* KPI */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpi.map(({ label, value, icon: Icon, to, color }) => {
          const card = (
            <Card className={to ? "h-full cursor-pointer transition-shadow hover:shadow-md" : "h-full"}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg bg-muted p-2 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight">
                    {loading ? "…" : value === null ? "—" : value}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          );
          return to ? (
            <Link key={label} to={to} className="block">
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      {/* Лента входящих */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-primary" />
            Последние заявки и события
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Заявок пока нет (или нет доступа к contact_submissions)
            </p>
          ) : (
            recent.map((s) => {
              const badge = STATUS_BADGE[s.status || ""];
              return (
                <div key={s.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{s.name || "Без имени"}</span>
                      {badge && (
                        <Badge variant="outline" className={`text-[10px] ${badge.cls}`}>
                          {badge.label}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</span>
                    </div>
                    {s.status !== "processed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-emerald-700 hover:bg-emerald-50"
                        onClick={() => markProcessed(s.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Обработано
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {s.phone && s.phone !== "-" && <span>{s.phone}</span>}
                    {s.email && s.email !== "-" && <span className="break-all">{s.email}</span>}
                  </div>
                  {s.message && (
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs text-foreground/80">
                      {s.message}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Быстрые переходы */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { to: "/admin/testimonials", label: "Модерация отзывов", hint: "Одобрить новые отзывы — они показываются на лендинге" },
          { to: "/admin/blog", label: "Написать в блог", hint: "Каждая статья — страница в поиске" },
          { to: "/admin/analytics", label: "Аналитика трафика", hint: "Просмотры, источники, конверсии" },
        ].map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className="group flex items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{q.label}</p>
              <p className="truncate text-xs text-muted-foreground">{q.hint}</p>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </main>
  );
}
