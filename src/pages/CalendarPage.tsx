import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  CalendarDays,
  AlertTriangle,
  ArrowLeft,
  Info,
} from "lucide-react";
import { PageLoader } from "@/components/LoadingSkeleton";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { withBrandPath } from "@/lib/brandPath";
import { EVENT_TYPES, OUTCOMES, eventTypeMeta } from "@/lib/caseEvents";
import { getDayInfo } from "@/lib/productionCalendar";
import PushNotificationToggle from "@/components/PushNotificationToggle";

interface CaseEvent {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  outcome: string | null;
  created_at: string;
}

type CalendarView = "month" | "week" | "day";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const normDate = (s: string) => s.slice(0, 10);

/**
 * Юридический календарь призывника (Модуль 4).
 *
 * Это новый «вид» поверх существующей таблицы `case_events` — тех же событий,
 * что показывает страница трекинга дела, но в сетке месяц/неделя/день. Нерабочие
 * дни РФ подсвечиваются из productionCalendar. Никакой новой схемы БД не
 * требуется; напоминания (push/email) добавятся в Фазе 3 движком уведомлений.
 */
export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CaseEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    event_date: dayKey(new Date()),
    event_type: "commission",
    title: "",
    description: "",
    outcome: "pending",
  });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      await loadEvents(session.user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = async (userId: string) => {
    const { data } = await supabase
      .from("case_events")
      .select("*")
      .eq("user_id", userId)
      .order("event_date", { ascending: true });
    setEvents(data || []);
    setLoading(false);
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CaseEvent[]>();
    for (const ev of events) {
      const k = normDate(ev.event_date);
      const arr = map.get(k);
      if (arr) arr.push(ev);
      else map.set(k, [ev]);
    }
    return map;
  }, [events]);

  const eventsOn = (d: Date) => eventsByDate.get(dayKey(d)) ?? [];

  // ---- навигация по периоду ----
  const goToday = () => setCursor(new Date());
  const goPrev = () =>
    setCursor((c) => (view === "month" ? subMonths(c, 1) : view === "week" ? subWeeks(c, 1) : subDays(c, 1)));
  const goNext = () =>
    setCursor((c) => (view === "month" ? addMonths(c, 1) : view === "week" ? addWeeks(c, 1) : addDays(c, 1)));

  const periodLabel = useMemo(() => {
    if (view === "month") return format(cursor, "LLLL yyyy", { locale: ru });
    if (view === "day") return format(cursor, "d MMMM yyyy, EEEE", { locale: ru });
    const ws = startOfWeek(cursor, { weekStartsOn: 1 });
    const we = endOfWeek(cursor, { weekStartsOn: 1 });
    return `${format(ws, "d MMM", { locale: ru })} — ${format(we, "d MMM yyyy", { locale: ru })}`;
  }, [view, cursor]);

  // ---- диалог события ----
  const openAdd = (date?: Date) => {
    setEditEvent(null);
    setForm({
      event_date: dayKey(date ?? cursor),
      event_type: "commission",
      title: "",
      description: "",
      outcome: "pending",
    });
    setDialogOpen(true);
  };

  const openEdit = (ev: CaseEvent) => {
    setEditEvent(ev);
    setForm({
      event_date: normDate(ev.event_date),
      event_type: ev.event_type,
      title: ev.title,
      description: ev.description || "",
      outcome: ev.outcome || "pending",
    });
    setDialogOpen(true);
  };

  const saveEvent = async () => {
    if (!form.title.trim() || !form.event_date) {
      toast({ title: "Заполните название и дату", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editEvent) {
        await supabase
          .from("case_events")
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq("id", editEvent.id);
        toast({ title: "Событие обновлено" });
      } else {
        await supabase.from("case_events").insert({ ...form, user_id: user.id });
        toast({ title: "Событие добавлено" });
      }
      setDialogOpen(false);
      if (user) await loadEvents(user.id);
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("case_events").delete().eq("id", id);
    setEvents((ev) => ev.filter((e) => e.id !== id));
    toast({ title: "Событие удалено" });
  };

  const formDayInfo = getDayInfo(parseISO(form.event_date));

  // ---- виды ----
  const renderMonth = () => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });

    return (
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-card">
        <div className="grid grid-cols-7 border-b border-ink/10 bg-muted/30">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "px-2 py-2 text-center text-xs font-medium text-muted-foreground",
                i >= 5 && "text-rose-500/70",
              )}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const info = getDayInfo(day);
            const dayEvents = eventsOn(day);
            const inMonth = isSameMonth(day, cursor);
            const today = isToday(day);
            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => openAdd(day)}
                className={cn(
                  "group relative flex min-h-[88px] flex-col gap-1 border-b border-r border-ink/5 p-1.5 text-left transition-colors hover:bg-gold/5",
                  !inMonth && "bg-muted/20 text-muted-foreground/50",
                  info.kind === "weekend" && inMonth && "bg-muted/30",
                  info.kind === "holiday" && "bg-rose-500/5",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      today && "bg-gold font-semibold text-paper",
                      !today && info.kind === "holiday" && "font-medium text-rose-600",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {info.kind === "holiday" && (
                    <span className="hidden truncate text-[9px] text-rose-500/80 sm:block" title={info.label}>
                      {info.label}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const meta = eventTypeMeta(ev.event_type);
                    return (
                      <span
                        key={ev.id}
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] hover:bg-background"
                      >
                        <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", meta.dot)} />
                        <span className="truncate">{ev.title}</span>
                      </span>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3} ещё</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end: endOfWeek(cursor, { weekStartsOn: 1 }) });

    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const info = getDayInfo(day);
          const dayEvents = eventsOn(day);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn("flex min-h-[140px] flex-col rounded-lg border border-ink/10 bg-card", info.isDayOff && "bg-muted/20")}
            >
              <button
                type="button"
                onClick={() => openAdd(day)}
                className={cn(
                  "flex items-center justify-between rounded-t-lg border-b border-ink/5 px-2 py-1.5 text-left hover:bg-gold/5",
                  today && "bg-gold/10",
                )}
              >
                <span className="text-xs font-medium capitalize">
                  {format(day, "EEEEEE", { locale: ru })} {format(day, "d")}
                </span>
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {info.kind === "holiday" && (
                <span className="px-2 pt-1 text-[10px] text-rose-500/80">{info.label}</span>
              )}
              <div className="flex flex-1 flex-col gap-1 p-1.5">
                {dayEvents.length === 0 ? (
                  <span className="px-1 py-2 text-[11px] text-muted-foreground/40">—</span>
                ) : (
                  dayEvents.map((ev) => {
                    const meta = eventTypeMeta(ev.event_type);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => openEdit(ev)}
                        className="flex items-start gap-1.5 rounded-md border border-ink/5 bg-background p-1.5 text-left hover:border-gold/30"
                      >
                        <span className={cn("mt-1 h-2 w-2 flex-shrink-0 rounded-full", meta.dot)} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{ev.title}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{meta.label}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const info = getDayInfo(cursor);
    const dayEvents = eventsOn(cursor);
    return (
      <div className="space-y-4">
        <div
          className={cn(
            "flex items-center justify-between rounded-xl border border-ink/10 p-4",
            info.isDayOff ? "bg-muted/30" : "bg-card",
          )}
        >
          <div>
            <p className="text-lg font-semibold capitalize">{format(cursor, "d MMMM yyyy", { locale: ru })}</p>
            <p className="text-sm capitalize text-muted-foreground">
              {format(cursor, "EEEE", { locale: ru })}
              {info.kind === "holiday" ? ` · ${info.label}` : info.kind === "weekend" ? " · выходной" : ""}
            </p>
          </div>
          <Button onClick={() => openAdd(cursor)} className="gap-2">
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        </div>
        {dayEvents.length === 0 ? (
          <Card className="py-12 text-center">
            <CardContent>
              <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">На этот день событий нет</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((ev) => {
              const meta = eventTypeMeta(ev.event_type);
              return (
                <Card key={ev.id}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <Badge variant="outline" className={cn("mb-1.5 text-xs", meta.badgeClass)}>
                        {meta.label}
                      </Badge>
                      <p className="font-semibold">{ev.title}</p>
                      {ev.description && <p className="mt-1 text-sm text-muted-foreground">{ev.description}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ev)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteEvent(ev.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <PageLoader message="Загружаем календарь..." />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-3 py-6 pb-24 sm:px-4 md:py-8 md:pb-12">
        <div className="mx-auto max-w-5xl">
          <Button
            variant="ghost"
            onClick={() => navigate(withBrandPath(location.pathname, "/dashboard"))}
            className="mb-4 md:hidden"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> В кабинет
          </Button>

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-number mb-1">Календарь</p>
              <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">Мой юридический календарь</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Дедлайны, явки и сроки по делу. Выходные и праздники РФ — отмечены.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Button onClick={() => openAdd()} className="gap-2 self-start bg-ink text-paper hover:bg-ink/90 sm:self-auto">
                <Plus className="h-4 w-4" /> Добавить событие
              </Button>
              <PushNotificationToggle />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Назад">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
                Сегодня
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Вперёд">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm font-medium capitalize">{periodLabel}</span>
            </div>
            <div className="inline-flex rounded-lg border border-ink/10 bg-muted/30 p-0.5">
              {(
                [
                  ["month", "Месяц"],
                  ["week", "Неделя"],
                  ["day", "День"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {view === "month" && renderMonth()}
          {view === "week" && renderWeek()}
          {view === "day" && renderDay()}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-ink/10 bg-muted/60" /> выходной
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-rose-200 bg-rose-500/10" /> праздник РФ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-gold" /> сегодня
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Info className="h-3 w-3" /> нерабочие дни — по производственному календарю РФ
            </span>
          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editEvent ? "Редактировать событие" : "Новое событие"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Дата</Label>
                <Input
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={form.event_type} onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formDayInfo.isDayOff && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="text-xs">
                  {formDayInfo.kind === "holiday" ? `Это праздничный день (${formDayInfo.label}).` : "Это выходной день."}{" "}
                  Госорганы и суды могут не работать — проверьте дату.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Напр.: явка по повестке, визит к ортопеду"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Подробности</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Адрес, кабинет, что взять с собой…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select value={form.outcome} onValueChange={(v) => setForm((f) => ({ ...f, outcome: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {editEvent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto px-2 text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteEvent(editEvent.id);
                    setDialogOpen(false);
                  }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Удалить
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={saveEvent} disabled={saving}>
                {saving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
