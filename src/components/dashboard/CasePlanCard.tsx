import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { withBrandPath } from "@/lib/brandPath";
import { cn } from "@/lib/utils";

type PlanAction = {
  title: string;
  description: string;
  path: string;
  icon: typeof FileText;
  priority: "high" | "medium" | "low";
  preserveBrand?: boolean;
};

type PlanState = {
  loading: boolean;
  docCount: number;
  analyzedCount: number;
  bestChance: number | null;
  bestCategory: string | null;
  nextEvent: { title: string; event_date: string } | null;
  activeLawyers: number;
  familyViewers: number;
};

const INITIAL_STATE: PlanState = {
  loading: true,
  docCount: 0,
  analyzedCount: 0,
  bestChance: null,
  bestCategory: null,
  nextEvent: null,
  activeLawyers: 0,
  familyViewers: 0,
};

const getRiskLabel = (chance: number | null, docCount: number) => {
  if (docCount === 0) return { label: "Риск не оценен", tone: "muted" as const };
  if (chance === null) return { label: "Нужен анализ", tone: "medium" as const };
  if (chance >= 65) return { label: "Есть сильная база", tone: "good" as const };
  if (chance >= 35) return { label: "Нужны доказательства", tone: "medium" as const };
  return { label: "Высокий риск призыва", tone: "high" as const };
};

export default function CasePlanCard() {
  const [state, setState] = useState<PlanState>(INITIAL_STATE);
  const navigate = useNavigate();
  const location = useLocation();

  const go = (action: PlanAction) => {
    navigate(action.preserveBrand === false ? action.path : withBrandPath(location.pathname, action.path));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session || session.user.is_anonymous) {
          if (!cancelled) setState({ ...INITIAL_STATE, loading: false });
          return;
        }

        const userId = session.user.id;
        const today = new Date().toISOString().slice(0, 10);
        const [docsRes, eventsRes, lawyersRes, familyRes] = await Promise.all([
          supabase
            .from("medical_documents_v2")
            .select("id, ai_fitness_category, ai_category_chance")
            .eq("user_id", userId),
          supabase
            .from("case_events")
            .select("title, event_date")
            .eq("user_id", userId)
            .gte("event_date", today)
            .order("event_date", { ascending: true })
            .limit(1),
          supabase
            .from("lawyer_clients")
            .select("id", { count: "exact", head: true })
            .eq("client_user_id", userId)
            .or("link_state.is.null,link_state.eq.linked_active"),
          supabase
            .from("family_access")
            .select("id", { count: "exact", head: true })
            .eq("owner_user_id", userId)
            .eq("status", "accepted")
            .is("revoked_at", null),
        ]);

        const docs = docsRes.data || [];
        const analyzedDocs = docs.filter((doc) => doc.ai_fitness_category || doc.ai_category_chance !== null);
        const bestDoc = analyzedDocs
          .filter((doc) => doc.ai_category_chance !== null)
          .sort((a, b) => (b.ai_category_chance || 0) - (a.ai_category_chance || 0))[0];

        if (!cancelled) {
          setState({
            loading: false,
            docCount: docs.length,
            analyzedCount: analyzedDocs.length,
            bestChance: bestDoc?.ai_category_chance ?? null,
            bestCategory: bestDoc?.ai_fitness_category ?? null,
            nextEvent: eventsRes.data?.[0] ?? null,
            activeLawyers: lawyersRes.count ?? 0,
            familyViewers: familyRes.count ?? 0,
          });
        }
      } catch (error) {
        console.warn("CasePlanCard load error", error);
        if (!cancelled) setState({ ...INITIAL_STATE, loading: false });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo<PlanAction[]>(() => {
    const next: PlanAction[] = [];

    if (state.docCount === 0) {
      next.push({
        title: "Загрузить первые документы",
        description: "Справки, заключения, выписки или снимки дадут ИИ основу для оценки.",
        path: "/dashboard/medical-documents",
        icon: FileText,
        priority: "high",
      });
    } else if (state.analyzedCount < state.docCount) {
      next.push({
        title: "Дождаться или запустить анализ",
        description: `${state.docCount - state.analyzedCount} документ(а) еще без итоговой оценки.`,
        path: "/dashboard/medical-documents",
        icon: Sparkles,
        priority: "high",
      });
    }

    if (!state.nextEvent) {
      next.push({
        title: "Добавить ближайший дедлайн",
        description: "Повестка, комиссия, суд или визит к врачу должны быть в календаре дела.",
        path: "/dashboard/case-tracking",
        icon: CalendarClock,
        priority: state.docCount > 0 ? "medium" : "low",
      });
    }

    if (state.activeLawyers === 0) {
      next.push({
        title: "Выбрать юриста или ввести код",
        description: "Юрист увидит досье только после вашего явного согласия.",
        path: "/lawyers",
        icon: ShieldCheck,
        priority: state.bestChance !== null && state.bestChance < 50 ? "high" : "medium",
        preserveBrand: false,
      });
    } else {
      next.push({
        title: "Открыть чат с юристом",
        description: "Быстрый доступ к переписке, вложениям и управлению доступом к досье.",
        path: "/client/messages",
        icon: MessageSquare,
        priority: "medium",
      });
    }

    if (state.familyViewers === 0) {
      next.push({
        title: "Подключить семью",
        description: "Родители смогут видеть план, дедлайны и помогать с оплатой без доступа к лишнему.",
        path: "/family",
        icon: Users,
        priority: "low",
      });
    }

    next.push({
      title: "Задать вопрос ИИ по делу",
      description: "Спросите, какие документы усилят позицию именно по вашим диагнозам.",
      path: "/dashboard/ai-chat",
      icon: MessageSquare,
      priority: "low",
    });

    return next.slice(0, 4);
  }, [state]);

  const risk = getRiskLabel(state.bestChance, state.docCount);
  const eventDays =
    state.nextEvent?.event_date ? differenceInDays(new Date(state.nextEvent.event_date), new Date()) : null;

  if (state.loading) {
    return (
      <Card className="border-gold/30 bg-gradient-to-br from-paper to-paper-deep/30">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gold/40 bg-gradient-to-br from-paper via-card to-paper-deep/20 overflow-hidden">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-gold-deep" />
              <span className="section-number">План дела</span>
            </div>
            <h2 className="font-serif text-xl md:text-2xl font-semibold text-foreground">
              Что сделать дальше, чтобы не потерять время
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Кабинет собирает документы, дедлайны, семью и юриста в один рабочий маршрут.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:justify-end">
            <Badge
              variant="outline"
              className={cn(
                "justify-center gap-1.5 rounded-md px-2.5 py-1.5",
                risk.tone === "good" && "border-emerald-300 text-emerald-700",
                risk.tone === "medium" && "border-amber-300 text-amber-700",
                risk.tone === "high" && "border-red-300 text-red-700",
              )}
            >
              {risk.tone === "good" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {risk.label}
            </Badge>
            <Badge variant="outline" className="justify-center rounded-md px-2.5 py-1.5">
              {state.docCount} док. · {state.analyzedCount} AI
            </Badge>
            <Badge variant="outline" className="justify-center rounded-md px-2.5 py-1.5">
              {state.activeLawyers > 0 ? `${state.activeLawyers} юрист` : "Юрист не выбран"}
            </Badge>
            <Badge variant="outline" className="justify-center rounded-md px-2.5 py-1.5">
              {state.familyViewers > 0 ? "Семья подключена" : "Семья не подключена"}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Текущая картина</p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {state.bestChance !== null ? `${state.bestChance}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.bestCategory
                    ? `лучшая оценка: категория ${state.bestCategory}`
                    : "загрузите документы, чтобы появилась оценка категории"}
                </p>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-foreground">
                  {state.nextEvent
                    ? state.nextEvent.title
                    : "Ближайший дедлайн не указан"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state.nextEvent
                    ? eventDays === 0
                      ? "Сегодня"
                      : eventDays === 1
                        ? "Завтра"
                        : eventDays !== null && eventDays > 0
                          ? `Через ${eventDays} дн.`
                          : "Дата уже наступила"
                    : "Добавьте повестку, комиссию, суд или обследование"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={`${action.path}-${action.title}`}
                  type="button"
                  onClick={() => go(action)}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-lg border bg-background/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                    action.priority === "high" && "border-seal/30 bg-seal/[0.03]",
                    action.priority === "medium" && "border-gold/40 bg-gold/[0.04]",
                    action.priority === "low" && "border-border/60",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground group-hover:bg-gold/15 group-hover:text-gold-deep">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">0{index + 1}</span>
                      <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-gold-deep" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate(withBrandPath(location.pathname, "/dashboard/medical-documents"))}>
            <FileText className="mr-1.5 h-4 w-4" />
            Пополнить досье
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(withBrandPath(location.pathname, "/dashboard/case-tracking"))}>
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Добавить дедлайн
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
