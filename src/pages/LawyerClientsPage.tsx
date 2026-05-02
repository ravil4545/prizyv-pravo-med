import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, MessageSquare, ChevronRight,
  Phone, Calendar, AlertTriangle, Crown, Filter,
} from "lucide-react";

const CRM_STAGES = [
  { value: "initial_contact",    label: "Первичный контакт" },
  { value: "no_diagnosis",       label: "Нет диагноза" },
  { value: "has_diagnosis",      label: "Есть диагноз" },
  { value: "examinations",       label: "Обследования" },
  { value: "diagnosis_confirmed",label: "Диагноз получен" },
  { value: "waiting_documents",  label: "Ожидание документов" },
  { value: "documents_received", label: "Документы получены" },
  { value: "military_office",    label: "Военкомат" },
  { value: "regional_commission",label: "Комиссия субъекта" },
  { value: "courts",             label: "Суды" },
  { value: "military_ticket",    label: "Получение ВБ" },
];

const STAGE_COLORS: Record<string, string> = {
  initial_contact: "bg-slate-100 text-slate-700",
  no_diagnosis: "bg-orange-100 text-orange-700",
  has_diagnosis: "bg-blue-100 text-blue-700",
  examinations: "bg-cyan-100 text-cyan-700",
  diagnosis_confirmed: "bg-indigo-100 text-indigo-700",
  waiting_documents: "bg-yellow-100 text-yellow-700",
  documents_received: "bg-lime-100 text-lime-700",
  military_office: "bg-purple-100 text-purple-700",
  regional_commission: "bg-pink-100 text-pink-700",
  courts: "bg-red-100 text-red-700",
  military_ticket: "bg-green-100 text-green-700",
};

interface LawyerClient {
  id: string; lawyer_id: string; client_user_id: string | null;
  client_name: string; client_phone: string | null; client_email: string | null;
  client_birth_year: number | null; crm_stage: string; diagnosis: string | null;
  expected_category: string | null; notes: string | null; priority: string;
  conscription_date: string | null; case_won: boolean; created_at: string; updated_at: string;
}

const LawyerClientsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isLawyer, isPro, profile, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [clients, setClients] = useState<LawyerClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [stageFilter, setStageFilter] = useState(searchParams.get("stage") || "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_name: "", client_phone: "", client_email: "",
    client_birth_year: "", crm_stage: "initial_contact",
    diagnosis: "", expected_category: "", notes: "", priority: "normal",
    conscription_date: "", client_email_link: "",
  });

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadClients();
  }, [user, profileLoading, isLawyer]);

  // Live unread count updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`clients-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lawyer_chat_messages" }, () => {
        if (clients.length) loadUnreadCounts(clients.map((c) => c.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, clients.length]);

  const loadClients = async () => {
    const { data } = await supabase
      .from("lawyer_clients")
      .select("*")
      .eq("lawyer_id", user!.id)
      .order("updated_at", { ascending: false });
    const rows = (data as LawyerClient[]) || [];
    setClients(rows);
    setLoading(false);
    if (rows.length) loadUnreadCounts(rows.map((c) => c.id));
  };

  const loadUnreadCounts = async (ids: string[]) => {
    const { data } = await supabase
      .from("lawyer_chat_messages")
      .select("lawyer_client_id")
      .in("lawyer_client_id", ids)
      .neq("sender_id", user!.id)
      .eq("is_read", false);
    const map: Record<string, number> = {};
    data?.forEach((r) => { map[r.lawyer_client_id] = (map[r.lawyer_client_id] || 0) + 1; });
    setUnreadMap(map);
  };

  const handleAdd = async () => {
    if (!form.client_name.trim()) {
      toast({ title: "Введите имя клиента", variant: "destructive" }); return;
    }
    const limit = profile?.clients_limit ?? 5;
    if (!isPro && clients.length >= limit) {
      toast({ title: `Лимит Basic: ${limit} клиентов. Upgrade до Pro`, variant: "destructive" }); return;
    }
    setSaving(true);

    let client_user_id: string | null = null;
    if (form.client_email_link) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", form.client_email_link)
        .maybeSingle();
      // If not found by id, try matching email via auth (not possible from client SDK)
      // We'll just store the provided value as-is for now
      client_user_id = profiles?.id || null;
    }

    const { data, error } = await supabase
      .from("lawyer_clients")
      .insert({
        lawyer_id: user!.id,
        client_user_id,
        client_name: form.client_name.trim(),
        client_phone: form.client_phone || null,
        client_email: form.client_email || null,
        client_birth_year: form.client_birth_year ? parseInt(form.client_birth_year) : null,
        crm_stage: form.crm_stage,
        diagnosis: form.diagnosis || null,
        expected_category: form.expected_category || null,
        notes: form.notes || null,
        priority: form.priority,
        conscription_date: form.conscription_date || null,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { toast({ title: "Ошибка сохранения", description: error.message, variant: "destructive" }); return; }
    setClients((prev) => [data as LawyerClient, ...prev]);
    setAddOpen(false);
    setForm({ client_name: "", client_phone: "", client_email: "", client_birth_year: "",
      crm_stage: "initial_contact", diagnosis: "", expected_category: "", notes: "", priority: "normal",
      conscription_date: "", client_email_link: "" });
    toast({ title: "Клиент добавлен" });
  };

  const filtered = clients
    .filter((c) => {
      const q = search.toLowerCase();
      if (search && !c.client_name.toLowerCase().includes(q) && !(c.client_phone || "").includes(q)) return false;
      if (stageFilter !== "all" && c.crm_stage !== stageFilter) return false;
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const ua = unreadMap[a.id] || 0;
      const ub = unreadMap[b.id] || 0;
      if (ua > 0 && ub === 0) return -1;
      if (ua === 0 && ub > 0) return 1;
      return 0;
    });

  if (profileLoading) return (
    <div className="min-h-screen bg-background"><Header />
      <main className="container mx-auto px-4 py-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" />CRM — Клиенты</h1>
            <p className="text-muted-foreground text-sm mt-1">{clients.length} клиентов</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/lawyer">← Кабинет</Link></Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Добавить клиента</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Новый клиент</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div><Label>ФИО *</Label>
                    <Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} placeholder="Иванов Иван Иванович" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Телефон</Label>
                      <Input value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} placeholder="+7..." />
                    </div>
                    <div><Label>Год рождения</Label>
                      <Input type="number" value={form.client_birth_year} onChange={(e) => setForm((f) => ({ ...f, client_birth_year: e.target.value }))} placeholder="2005" />
                    </div>
                  </div>
                  <div><Label>Email</Label>
                    <Input value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} placeholder="client@email.com" />
                  </div>
                  <div><Label>Этап CRM</Label>
                    <Select value={form.crm_stage} onValueChange={(v) => setForm((f) => ({ ...f, crm_stage: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CRM_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Диагноз</Label>
                      <Input value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} placeholder="Остеохондроз..." />
                    </div>
                    <div><Label>Ожид. категория</Label>
                      <Input value={form.expected_category} onChange={(e) => setForm((f) => ({ ...f, expected_category: e.target.value }))} placeholder="В" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Приоритет</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Низкий</SelectItem>
                          <SelectItem value="normal">Обычный</SelectItem>
                          <SelectItem value="high">Высокий</SelectItem>
                          <SelectItem value="urgent">Срочный</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Дата призыва</Label>
                      <Input type="date" value={form.conscription_date} onChange={(e) => setForm((f) => ({ ...f, conscription_date: e.target.value }))} />
                    </div>
                  </div>
                  <div><Label>Заметки</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Дополнительная информация..." rows={3} />
                  </div>
                  <div><Label>ID аккаунта клиента (если зарегистрирован)</Label>
                    <Input value={form.client_email_link} onChange={(e) => setForm((f) => ({ ...f, client_email_link: e.target.value }))} placeholder="UUID из профиля клиента" />
                    <p className="text-xs text-muted-foreground mt-1">Клиент найдёт свой ID в настройках профиля</p>
                  </div>
                  <Button onClick={handleAdd} disabled={saving} className="w-full">
                    {saving ? "Сохраняем..." : "Добавить клиента"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Поиск по имени или телефону..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Все этапы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все этапы</SelectItem>
              {CRM_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Приоритет" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="urgent">Срочные</SelectItem>
              <SelectItem value="high">Высокий</SelectItem>
              <SelectItem value="normal">Обычный</SelectItem>
              <SelectItem value="low">Низкий</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Client list */}
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full mb-2" />)
          : filtered.length === 0
            ? (
                <div className="text-center py-16">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">{search || stageFilter !== "all" ? "Клиенты не найдены" : "Нет клиентов. Добавьте первого."}</p>
                </div>
              )
            : (
                <div className="space-y-2">
                  {filtered.map((c) => (
                    <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/lawyer/clients/${c.id}`)}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{c.client_name}</span>
                              {c.priority === "urgent" && <Badge variant="destructive" className="text-xs">Срочно</Badge>}
                              {c.priority === "high" && <Badge variant="secondary" className="text-xs">Высокий</Badge>}
                              {c.case_won && <Badge className="text-xs bg-green-100 text-green-700">✓ ВБ получен</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                              {c.client_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.client_phone}</span>}
                              {c.client_birth_year && <span>{c.client_birth_year} г.р.</span>}
                              {c.conscription_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />до {new Date(c.conscription_date).toLocaleDateString("ru-RU")}</span>}
                              {c.diagnosis && <span className="truncate max-w-[200px]">{c.diagnosis}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[c.crm_stage] || "bg-gray-100 text-gray-700"}`}>
                              {CRM_STAGES.find((s) => s.value === c.crm_stage)?.label || c.crm_stage}
                            </span>
                            <div className="relative">
                              <Button variant="ghost" size="icon" className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); navigate(`/lawyer/chat/${c.id}`); }}>
                                <MessageSquare className={unreadMap[c.id] ? "h-4 w-4 text-primary" : "h-4 w-4"} />
                              </Button>
                              {unreadMap[c.id] > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 pointer-events-none">
                                  {unreadMap[c.id] > 9 ? "9+" : unreadMap[c.id]}
                                </span>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
      </main>
      <Footer />
    </div>
  );
};

export default LawyerClientsPage;
