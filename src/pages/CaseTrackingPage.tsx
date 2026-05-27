import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Calendar, CheckCircle2, XCircle, Clock, Edit2, ScanLine, FileSignature } from "lucide-react";
import { PageLoader } from "@/components/LoadingSkeleton";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import SummonsUploadDialog from "@/components/SummonsUploadDialog";
import AppealGeneratorDialog from "@/components/AppealGeneratorDialog";

interface CaseEvent {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  outcome: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  { value: "commission", label: "Призывная комиссия" },
  { value: "appeal", label: "Обжалование" },
  { value: "court", label: "Суд" },
  { value: "medical", label: "Медицинское освидетельствование" },
  { value: "document", label: "Подача документов" },
  { value: "other", label: "Другое" },
];

const OUTCOMES = [
  { value: "positive", label: "Положительный" },
  { value: "negative", label: "Отрицательный" },
  { value: "pending", label: "В ожидании" },
];

const outcomeIcon = (outcome: string | null) => {
  if (outcome === "positive") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (outcome === "negative") return <XCircle className="h-4 w-4 text-destructive" />;
  if (outcome === "pending") return <Clock className="h-4 w-4 text-amber-500" />;
  return null;
};

const outcomeBadge = (outcome: string | null) => {
  if (outcome === "positive") return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
  if (outcome === "negative") return "bg-destructive/10 text-destructive border-destructive/20";
  if (outcome === "pending") return "bg-amber-500/10 text-amber-600 border-amber-200";
  return "bg-muted text-muted-foreground";
};

export default function CaseTrackingPage() {
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CaseEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [summonsDialogOpen, setSummonsDialogOpen] = useState(false);
  const [appealForEvent, setAppealForEvent] = useState<CaseEvent | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    event_date: new Date().toISOString().split("T")[0],
    event_type: "commission",
    title: "",
    description: "",
    outcome: "pending",
  });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
    loadEvents(session.user.id);
  };

  const loadEvents = async (userId: string) => {
    const { data } = await supabase
      .from("case_events")
      .select("*")
      .eq("user_id", userId)
      .order("event_date", { ascending: true });
    setEvents(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditEvent(null);
    setForm({ event_date: new Date().toISOString().split("T")[0], event_type: "commission", title: "", description: "", outcome: "pending" });
    setDialogOpen(true);
  };

  const openEdit = (ev: CaseEvent) => {
    setEditEvent(ev);
    setForm({ event_date: ev.event_date, event_type: ev.event_type, title: ev.title, description: ev.description || "", outcome: ev.outcome || "pending" });
    setDialogOpen(true);
  };

  const saveEvent = async () => {
    if (!form.title.trim() || !form.event_date) {
      toast({ title: "Заполните обязательные поля", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editEvent) {
        await supabase.from("case_events").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editEvent.id);
        toast({ title: "Событие обновлено" });
      } else {
        await supabase.from("case_events").insert({ ...form, user_id: user.id });
        toast({ title: "Событие добавлено" });
      }
      setDialogOpen(false);
      loadEvents(user.id);
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("case_events").delete().eq("id", id);
    setEvents(ev => ev.filter(e => e.id !== id));
    toast({ title: "Событие удалено" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <PageLoader message="Загружаем события..." />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 pb-24 md:pb-12">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Назад в кабинет
          </Button>

          <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
            <div>
              <p className="section-number mb-1">Дело</p>
              <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight">Трекинг призывного дела</h1>
              <p className="text-muted-foreground text-sm mt-1">История событий и обращений по вашему делу</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSummonsDialogOpen(true)}
                className="gap-2 border-gold/40 hover:bg-gold/5"
              >
                <ScanLine className="h-4 w-4 text-gold-deep" />
                <span className="hidden sm:inline">Распознать повестку</span>
                <span className="sm:hidden">Повестка</span>
              </Button>
              <Button onClick={openAdd} className="gap-2 bg-ink hover:bg-ink/90 text-paper">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Добавить событие</span>
                <span className="sm:hidden">Событие</span>
              </Button>
            </div>
          </div>

          {events.length === 0 ? (
            <Card className="text-center py-16">
              <CardContent>
                <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">Событий пока нет</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Начните фиксировать этапы вашего призывного дела</p>
                <Button onClick={openAdd} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> Добавить первое событие
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border/60 hidden sm:block" />

              <div className="space-y-4">
                {events.map((ev, idx) => {
                  const typeLabel = EVENT_TYPES.find(t => t.value === ev.event_type)?.label || ev.event_type;
                  const outcomeLabel = OUTCOMES.find(o => o.value === ev.outcome)?.label;
                  return (
                    <div key={ev.id} className="flex gap-4 sm:gap-6 relative">
                      {/* Dot */}
                      <div className="hidden sm:flex items-start pt-4">
                        <div className="w-3 h-3 rounded-full bg-primary border-2 border-background ring-2 ring-primary/30 z-10" />
                      </div>

                      <Card className="flex-1 hover:shadow-soft transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs text-muted-foreground font-medium">
                                  {format(new Date(ev.event_date), "d MMMM yyyy", { locale: ru })}
                                </span>
                                <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                                {ev.outcome && (
                                  <Badge variant="outline" className={`text-xs flex items-center gap-1 ${outcomeBadge(ev.outcome)}`}>
                                    {outcomeIcon(ev.outcome)}
                                    {outcomeLabel}
                                  </Badge>
                                )}
                              </div>
                              <p className="font-semibold text-foreground">{ev.title}</p>
                              {ev.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ev.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {ev.outcome === "negative" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs border-gold/40 hover:bg-gold/5"
                                  onClick={() => setAppealForEvent(ev)}
                                >
                                  <FileSignature className="h-3.5 w-3.5 text-gold-deep" />
                                  <span className="hidden sm:inline">Жалоба</span>
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ev)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteEvent(ev.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editEvent ? "Редактировать событие" : "Новое событие"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Дата</Label>
                <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Краткое описание события" />
            </div>
            <div className="space-y-1.5">
              <Label>Подробности</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Детали, документы, контакты..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Результат</Label>
              <Select value={form.outcome} onValueChange={v => setForm(f => ({ ...f, outcome: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Отмена</Button>
              <Button onClick={saveEvent} disabled={saving} className="flex-1">
                {saving ? "Сохраняем..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SummonsUploadDialog
        open={summonsDialogOpen}
        onOpenChange={setSummonsDialogOpen}
        onCreated={() => user && loadEvents(user.id)}
      />

      <AppealGeneratorDialog
        event={appealForEvent}
        open={!!appealForEvent}
        onOpenChange={(o) => !o && setAppealForEvent(null)}
      />
    </div>
  );
}
