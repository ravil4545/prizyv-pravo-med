import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CalendarClock, Flag, ListChecks, Stethoscope, ChevronRight, CalendarCheck2, RefreshCw,
} from "lucide-react";
import {
  deadlineBucket, deadlineToneClass, formatDueLabel, formatDateRu, plural,
  BUCKET_LABEL, type DeadlineBucket,
} from "@/lib/deadlines";
import { loadAgendaItems, type AgendaItem, type AgendaKind } from "@/lib/lawyerAgendaData";

// ════════════════════════════════════════════════════════════════════════
//  «Сроки» (P4 — глубокая CRM юриста). Одна сводка дедлайнов ПО ВСЕМ делам:
//  даты призыва/комиссии (lawyer_clients.conscription_date) + сроки задач и
//  дообследований (action_plan_items / examination_plan_items.due_date).
//  Всё, что юрист раньше видел только открывая каждую карточку по очереди, —
//  здесь на одном экране, сгруппировано по срочности.
//
//  Доступ: RLS отдаёт юристу только его строки (lawyer_id = auth.uid()).
//  case_events (таймлайн клиента) юристу по RLS недоступны — поэтому источник
//  сроков именно lawyer-owned таблицы. Таблицы планов ещё не в сгенерированных
//  типах → (supabase as any).
// ════════════════════════════════════════════════════════════════════════

const BUCKET_ORDER: DeadlineBucket[] = ["overdue", "today", "tomorrow", "week", "later"];

const KIND_META: Record<AgendaKind, { icon: typeof Flag; label: string; tint: string }> = {
  conscription: { icon: Flag, label: "Призыв / комиссия", tint: "text-red-500" },
  action: { icon: ListChecks, label: "Задача", tint: "text-blue-500" },
  exam: { icon: Stethoscope, label: "Дообследование", tint: "text-cyan-500" },
};

const LawyerAgendaPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    if (!user) { navigate("/auth?next=/lawyer/agenda", { replace: true }); return; }
    if (!isLawyer) { navigate("/dashboard", { replace: true }); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileLoading, isLawyer]);

  const load = async () => {
    setLoading(true);
    const next = await loadAgendaItems(user!.id);
    setItems(next);
    setLoading(false);
  };

  // Группировка по корзинам срочности + сортировка по дате внутри корзины.
  const groups = useMemo(() => {
    const byBucket = new Map<DeadlineBucket, AgendaItem[]>();
    for (const it of items) {
      const b = deadlineBucket(it.date) ?? "later";
      const arr = byBucket.get(b);
      if (arr) arr.push(it);
      else byBucket.set(b, [it]);
    }
    return BUCKET_ORDER
      .map((bucket) => ({
        bucket,
        items: (byBucket.get(bucket) || []).sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  const overdueCount = groups.find((g) => g.bucket === "overdue")?.items.length ?? 0;
  const total = items.length;

  // Отметить задачу/дообследование выполненным — уходит из повестки.
  const completeItem = async (item: AgendaItem) => {
    if (item.kind === "conscription") return;
    const table = item.kind === "action" ? "action_plan_items" : "examination_plan_items";
    setItems((prev) => prev.filter((x) => x.id !== item.id)); // оптимистично
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- план дела не в сгенерированных типах
    const { error } = await (supabase as any).from(table).update({ status: "done" }).eq("id", item.rawId);
    if (error) {
      setItems((prev) => [...prev, item]); // откат (memo пересортирует)
      toast({ title: "Не удалось отметить", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Отмечено выполненным" });
    }
  };

  if (profileLoading || !user || !isLawyer) {
    return (
      <div className="min-h-screen bg-background"><Header />
        <main className="container mx-auto px-4 py-8 space-y-4 max-w-3xl">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Заголовок */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <CalendarClock className="h-6 w-6 text-primary" />
              Сроки по делам
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? "Собираем дедлайны…"
                : total === 0
                  ? "Нет активных сроков"
                  : `${plural(total, "срок", "срока", "сроков")} по всем делам` +
                    (overdueCount > 0 ? ` · ${plural(overdueCount, "просрочен", "просрочено", "просрочено")}` : "")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="flex-shrink-0 self-start">
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
            Обновить
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : total === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <CalendarCheck2 className="mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="font-medium">Сроков пока нет</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Поставьте дату призыва в карточке дела или срок у задачи в плане действий —
                и дедлайн появится здесь.
              </p>
              <p className="mt-2 max-w-sm text-xs text-muted-foreground/80">
                «Срочные дела» на дашборде — это пометка приоритета, а не дата. Сюда они
                попадут, только когда у них появится конкретный срок.
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link to="/lawyer/clients">К списку клиентов</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map(({ bucket, items: groupItems }) => (
              <section key={bucket}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className={cn("text-sm font-semibold", deadlineToneClass(bucket))}>
                    {BUCKET_LABEL[bucket]}
                  </h2>
                  <span className="text-xs text-muted-foreground">{groupItems.length}</span>
                </div>
                <div className="space-y-2">
                  {groupItems.map((item) => (
                    <AgendaRow key={item.id} item={item} onComplete={completeItem} onOpen={() => navigate(`/lawyer/clients/${item.clientId}`)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

function AgendaRow({
  item,
  onComplete,
  onOpen,
}: {
  item: AgendaItem;
  onComplete: (item: AgendaItem) => void;
  onOpen: () => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const bucket = deadlineBucket(item.date);
  const tone = bucket ? deadlineToneClass(bucket) : "text-muted-foreground";
  const checkable = item.kind !== "conscription";

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start gap-3 p-3">
        {checkable ? (
          <Checkbox
            className="mt-1 flex-shrink-0"
            checked={false}
            onCheckedChange={() => onComplete(item)}
            aria-label="Отметить выполненным"
          />
        ) : (
          <span className="mt-0.5 flex-shrink-0" aria-hidden>
            <Icon className={cn("h-4 w-4", meta.tint)} />
          </span>
        )}

        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {checkable && <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", meta.tint)} />}
            <span className="truncate text-sm font-medium">{item.title}</span>
            {item.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Срочно</Badge>}
            {item.priority === "high" && <Badge variant="secondary" className="text-[10px]">Высокий</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="truncate">{item.clientName}</span>
            <span aria-hidden>·</span>
            <span>{meta.label}{item.sub ? ` — ${item.sub}` : ""}</span>
          </div>
          <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", tone)}>
            <CalendarClock className="h-3 w-3" />
            {formatDueLabel(item.date)}
            <span className="font-normal text-muted-foreground">· {formatDateRu(item.date)}</span>
          </div>
        </button>

        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer text-muted-foreground" onClick={onOpen} />
      </CardContent>
    </Card>
  );
}

export default LawyerAgendaPage;
