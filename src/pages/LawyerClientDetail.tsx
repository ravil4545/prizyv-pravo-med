import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { getSignedDocumentUrl, extractFilePath } from "@/lib/storage";
import PdfViewer from "@/components/PdfViewer";
import DocxViewer from "@/components/DocxViewer";
import {
  ArrowLeft, Save, MessageSquare, Brain, FileText, User,
  Phone, Calendar, AlertCircle, CheckCircle, Clock,
  ClipboardList, Plus, Loader2, Eye, Download, Trophy, ChevronDown,
  ShieldCheck, Lock, FileSignature,
} from "lucide-react";
import TemplatePickerDialog from "@/components/TemplatePickerDialog";
import type { ClientPrefillSource } from "@/lib/lawyerTemplates";

const stripMarkdown = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")
   .replace(/#+\s*/g, "").replace(/_{1,2}(.+?)_{1,2}/g, "$1").trim();

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
  { value: "military_ticket",    label: "Получение ВБ ✓" },
];

interface MedDoc {
  id: string; title: string | null; document_date: string | null;
  ai_fitness_category: string | null; ai_category_chance: number | null;
  ai_recommendations: string[] | null; ai_explanation: string | null;
  file_url: string; created_at: string;
}
interface CaseNote { id: string; content: string; note_type: string; created_at: string; }
interface AIAnalysis {
  overall_category?: string; category_basis?: string; strong_points?: string[];
  weak_points?: string[]; examination_plan?: { type: string; name: string; reason: string }[];
  missing_documents?: string[]; risks?: string[]; lawyer_recommendations?: string[]; raw?: string;
}

const LawyerClientDetail = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, isPro, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [client, setClient] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [medDocs, setMedDocs] = useState<MedDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [hasDocAccess, setHasDocAccess] = useState(false);

  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const [newDocsDetected, setNewDocsDetected] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<{ title: string; file_url: string } | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Адрес из profiles — для авто-заполнения шаблонов; подгружается когда
  // клиент привязан и есть доступ к его данным
  const [clientAddress, setClientAddress] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadClient();
  }, [user, profileLoading, isLawyer, clientId]);

  const loadClient = async () => {
    const { data } = await supabase.from("lawyer_clients").select("*").eq("id", clientId).eq("lawyer_id", user!.id).single();
    if (!data) { navigate("/lawyer/clients"); return; }
    setClient(data);
    setForm({
      client_name: data.client_name || "",
      client_phone: data.client_phone || "",
      client_email: data.client_email || "",
      client_birth_year: data.client_birth_year?.toString() || "",
      crm_stage: data.crm_stage || "initial_contact",
      diagnosis: data.diagnosis || "",
      expected_category: data.expected_category || "",
      notes: data.notes || "",
      priority: data.priority || "normal",
      conscription_date: data.conscription_date || "",
      client_user_id: data.client_user_id || "",
    });
    setLoading(false);
    loadNotes();
    if (data.client_user_id) loadMedDocs(data.client_user_id);
  };

  const loadMedDocs = async (clientUserId: string) => {
    setDocsLoading(true);
    const { data: access } = await supabase.from("client_document_access")
      .select("id").eq("client_user_id", clientUserId).eq("lawyer_id", user!.id).eq("is_active", true).maybeSingle();
    setHasDocAccess(!!access);
    if (access) {
      const { data } = await supabase.from("medical_documents_v2")
        .select("id,title,document_date,ai_fitness_category,ai_category_chance,ai_recommendations,ai_explanation,file_url,created_at")
        .eq("user_id", clientUserId).order("document_date", { ascending: false });
      setMedDocs((data as MedDoc[]) || []);

      // Подтягиваем адрес из profiles — для авто-подстановки в шаблоны
      const { data: prof } = await supabase
        .from("profiles")
        .select("registration_address, actual_address")
        .eq("id", clientUserId)
        .maybeSingle();
      if (prof) {
        setClientAddress(
          (prof as any).registration_address || (prof as any).actual_address || null,
        );
      }
    }
    setDocsLoading(false);
  };

  const loadNotes = async () => {
    const { data } = await supabase.from("case_notes").select("*").eq("lawyer_client_id", clientId).order("created_at", { ascending: false });
    const allNotes = (data as CaseNote[]) || [];
    setNotes(allNotes);
    // Restore the most recent AI analysis so it persists across tab switches / page reloads
    const lastAiNote = allNotes.find(n => n.note_type === "ai_analysis");
    if (lastAiNote) {
      try {
        setAiAnalysis(JSON.parse(lastAiNote.content));
        setLastAnalysisAt(lastAiNote.created_at);
      } catch { /* ignore malformed */ }
    }
  };

  // Detect docs uploaded after the last analysis
  useEffect(() => {
    if (!lastAnalysisAt || !aiAnalysis || medDocs.length === 0) {
      setNewDocsDetected(false);
      return;
    }
    setNewDocsDetected(medDocs.some(doc => doc.created_at > lastAnalysisAt));
  }, [medDocs, lastAnalysisAt, aiAnalysis]);

  // Live updates: new client documents while the tab is open
  useEffect(() => {
    if (!client?.client_user_id || !hasDocAccess) return;
    const uid = client.client_user_id;
    const channel = supabase.channel(`medDocs-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "medical_documents_v2", filter: `user_id=eq.${uid}` },
        (payload) => { setMedDocs(prev => [payload.new as MedDoc, ...prev]); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [client?.client_user_id, hasDocAccess]);

  const handleSave = async () => {
    setSaving(true);
    const prevStage = client?.crm_stage;
    const { error } = await supabase.from("lawyer_clients").update({
      client_name: form.client_name, client_phone: form.client_phone || null,
      client_email: form.client_email || null,
      client_birth_year: form.client_birth_year ? parseInt(form.client_birth_year) : null,
      crm_stage: form.crm_stage, diagnosis: form.diagnosis || null,
      expected_category: form.expected_category || null, notes: form.notes || null,
      priority: form.priority, conscription_date: form.conscription_date || null,
      client_user_id: form.client_user_id || null,
    }).eq("id", clientId);
    if (error) { toast({ title: "Ошибка", description: error.message, variant: "destructive" }); }
    else {
      setClient((prev) => ({ ...prev, ...form }));
      if (form.client_user_id) loadMedDocs(form.client_user_id);
      if (prevStage !== form.crm_stage) {
        await supabase.from("case_notes").insert({
          lawyer_client_id: clientId, author_id: user!.id,
          content: `Этап изменён: ${CRM_STAGES.find((s) => s.value === prevStage)?.label} → ${CRM_STAGES.find((s) => s.value === form.crm_stage)?.label}`,
          note_type: "stage_change",
        });
        loadNotes();
      }
      toast({ title: "Сохранено" });
    }
    setSaving(false);
  };

  const handleMarkWon = async () => {
    await supabase.from("lawyer_clients").update({ case_won: true, crm_stage: "military_ticket" }).eq("id", clientId);
    setClient((prev) => ({ ...prev, case_won: true, crm_stage: "military_ticket" }));
    setForm((f) => ({ ...f, crm_stage: "military_ticket" }));
    await supabase.from("case_notes").insert({ lawyer_client_id: clientId, author_id: user!.id, content: "🏆 Дело выиграно — военный билет получен!", note_type: "stage_change" });
    loadNotes();
    toast({ title: "Поздравляем! Дело закрыто ✓" });
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const { data } = await supabase.from("case_notes").insert({
      lawyer_client_id: clientId, author_id: user!.id, content: newNote.trim(), note_type: "note",
    }).select().single();
    if (data) setNotes((prev) => [data as CaseNote, ...prev]);
    setNewNote("");
    setAddingNote(false);
  };

  const runAiAnalysis = async () => {
    if (!isPro) { toast({ title: "Функция доступна в тарифе Pro", variant: "destructive" }); return; }
    setAiLoading(true); setAiError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-analyze-client", {
        body: { lawyerClientId: clientId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const analysis: AIAnalysis = res.data.analysis;
      setAiAnalysis(analysis);
      // Auto-save to case_notes so it persists across tab switches
      await supabase.from("case_notes").insert({
        lawyer_client_id: clientId,
        author_id: user!.id,
        content: JSON.stringify(analysis),
        note_type: "ai_analysis",
      });
      loadNotes();
      toast({ title: "ИИ-анализ сохранён в заметках" });
    } catch (e) { setAiError(e instanceof Error ? e.message : "Ошибка анализа"); }
    setAiLoading(false);
  };

  if (loading || profileLoading) return (
    <div className="min-h-screen bg-background"><Header />
      <main className="container mx-auto px-4 py-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </main>
    </div>
  );

  const openPreview = async (doc: { title: string; file_url: string }) => {
    setPreviewDoc(doc);
    setPreviewSignedUrl(null);
    setPreviewLoading(true);
    const url = await getSignedDocumentUrl(doc.file_url);
    setPreviewSignedUrl(url);
    setPreviewLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/lawyer/clients")}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{client?.client_name}</h1>
            <p className="text-sm text-muted-foreground">
              {CRM_STAGES.find((s) => s.value === client?.crm_stage)?.label}
              {client?.case_won && " · ВБ получен ✓"}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {!client?.case_won && (
              <Button variant="outline" size="sm" className="text-green-600 border-green-300" onClick={handleMarkWon}>
                <Trophy className="h-4 w-4 mr-1" />ВБ получен
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>
              <FileSignature className="h-4 w-4 mr-1" />Из шаблона
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/lawyer/chat/${clientId}`)}>
              <MessageSquare className="h-4 w-4 mr-1" />Чат
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Сохранить
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="overview"><User className="h-4 w-4 mr-1.5" />Обзор</TabsTrigger>
            <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1.5" />Документы</TabsTrigger>
            <TabsTrigger value="analysis"><Brain className="h-4 w-4 mr-1.5" />ИИ-анализ</TabsTrigger>
            <TabsTrigger value="timeline"><ClipboardList className="h-4 w-4 mr-1.5" />Заметки</TabsTrigger>
          </TabsList>

          {/* ── TAB: Overview ────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            {/* Карточка контактных данных */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {client?.client_user_id && !hasDocAccess ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  Контактные данные клиента
                </CardTitle>
                {client?.client_user_id && (
                  hasDocAccess ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> Доступ открыт
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Lock className="h-3 w-3" /> Скрыто до согласия
                    </Badge>
                  )
                )}
              </CardHeader>
              <CardContent>
                {client?.client_user_id && !hasDocAccess ? (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4">
                    <p className="text-sm font-medium mb-1.5">Контакты клиента пока скрыты</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Клиент пришёл через каталог сайта и общается с вами анонимно. ФИО, телефон
                      и email откроются автоматически, как только клиент даст вам доступ к своим
                      медицинским документам в личном кабинете.
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Попросите его в чате открыть доступ — раздел «Доступ юриста к документам» в кабинете.
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><Label>ФИО</Label><Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} /></div>
                    <div><Label>Телефон</Label><Input value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} /></div>
                    <div><Label>Email</Label><Input value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} /></div>
                    <div><Label>Год рождения</Label><Input type="number" value={form.client_birth_year} onChange={(e) => setForm((f) => ({ ...f, client_birth_year: e.target.value }))} /></div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Карточка дела — заполняет юрист */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Дело и параметры</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div><Label>Дата призыва</Label><Input type="date" value={form.conscription_date} onChange={(e) => setForm((f) => ({ ...f, conscription_date: e.target.value }))} /></div>
                <div><Label>Приоритет</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Низкий</SelectItem><SelectItem value="normal">Обычный</SelectItem>
                      <SelectItem value="high">Высокий</SelectItem><SelectItem value="urgent">Срочный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2"><Label>Этап CRM</Label>
                  <Select value={form.crm_stage} onValueChange={(v) => setForm((f) => ({ ...f, crm_stage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CRM_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Диагноз</Label><Input value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} /></div>
                <div><Label>Ожидаемая категория</Label><Input value={form.expected_category} onChange={(e) => setForm((f) => ({ ...f, expected_category: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label>Заметки</Label>
                  <Textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>

                {/* UUID-поле — только если клиент НЕ привязан (manual mode) */}
                {!client?.client_user_id && (
                  <div className="sm:col-span-2">
                    <Label>ID аккаунта клиента (для доступа к документам)</Label>
                    <Input
                      value={form.client_user_id}
                      onChange={(e) => setForm((f) => ({ ...f, client_user_id: e.target.value }))}
                      placeholder="UUID из профиля клиента на сайте"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Клиент найдёт свой ID в личном кабинете → блок «Доступ юриста к документам»</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: Documents ───────────────────────────────────────────── */}
          <TabsContent value="documents">
            {!client?.client_user_id
              ? (
                  <Card><CardContent className="py-8 text-center">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="font-medium">Клиент не привязан к аккаунту</p>
                    <p className="text-sm text-muted-foreground mt-1">Укажите ID аккаунта клиента во вкладке «Обзор»</p>
                  </CardContent></Card>
                )
              : !hasDocAccess
                ? (
                    <Card><CardContent className="py-8 text-center">
                      <Clock className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                      <p className="font-medium">Доступ к документам не открыт</p>
                      <p className="text-sm text-muted-foreground mt-1">Клиент должен нажать «Поделиться с юристом» в своём кабинете</p>
                    </CardContent></Card>
                  )
              : docsLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full mb-2" />)
              : medDocs.length === 0
                ? (
                    <Card><CardContent className="py-8 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">У клиента нет загруженных документов</p>
                    </CardContent></Card>
                  )
                : (
                    <div className="space-y-3">
                      {medDocs.map((doc) => (
                        <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium">{doc.title || "Документ без названия"}</p>
                                <p className="text-sm text-muted-foreground">{doc.document_date || "Дата не указана"}</p>
                                {doc.ai_fitness_category && (
                                  <div className="mt-2 space-y-1">
                                    <Badge variant="outline" className="text-xs font-semibold">
                                      Категория: {doc.ai_fitness_category}
                                    </Badge>
                                    {doc.ai_explanation && (
                                      <p className="text-xs text-muted-foreground mt-1">{doc.ai_explanation}</p>
                                    )}
                                    {doc.ai_recommendations && doc.ai_recommendations.length > 0 && (
                                      <ul className="text-xs text-muted-foreground list-disc list-inside mt-1">
                                        {doc.ai_recommendations.map((r, i) => <li key={i}>{r}</li>)}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-shrink-0 gap-1.5"
                                onClick={() => openPreview({ title: doc.title || "Документ", file_url: doc.file_url })}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Открыть
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
          </TabsContent>

          {/* ── TAB: AI Analysis ─────────────────────────────────────────── */}
          <TabsContent value="analysis" className="space-y-4">
            {!isPro && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <p className="text-sm">ИИ-анализ доступен в тарифе <strong>Pro</strong>. Upgrade для получения комплексного анализа дела.</p>
                </CardContent>
              </Card>
            )}
            {newDocsDetected && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Новые документы с момента последнего анализа</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Клиент загрузил новые документы. Рекомендуем запустить повторный анализ.</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end">
              <Button onClick={runAiAnalysis} disabled={aiLoading || !isPro}>
                {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Анализируем...</> : <><Brain className="h-4 w-4 mr-2" />Запустить анализ</>}
              </Button>
            </div>
            {aiError && <Card className="border-red-200"><CardContent className="p-4 text-red-600 text-sm">{aiError}</CardContent></Card>}
            {aiAnalysis && (
              <div className="space-y-4">
                {aiAnalysis.overall_category && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" />Итоговая категория</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-primary">{aiAnalysis.overall_category}</p>
                      <p className="text-sm text-muted-foreground mt-1">{aiAnalysis.category_basis}</p>
                    </CardContent>
                  </Card>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  {aiAnalysis.strong_points?.length ? (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">✓ Сильные стороны</CardTitle></CardHeader>
                      <CardContent><ul className="text-sm space-y-1 list-disc list-inside">{aiAnalysis.strong_points.map((p, i) => <li key={i}>{p}</li>)}</ul></CardContent>
                    </Card>
                  ) : null}
                  {aiAnalysis.weak_points?.length ? (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">✗ Слабые стороны</CardTitle></CardHeader>
                      <CardContent><ul className="text-sm space-y-1 list-disc list-inside">{aiAnalysis.weak_points.map((p, i) => <li key={i}>{p}</li>)}</ul></CardContent>
                    </Card>
                  ) : null}
                </div>
                {aiAnalysis.examination_plan?.length ? (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">📋 План дообследования</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {aiAnalysis.examination_plan.map((item, i) => (
                          <div key={i} className="flex gap-2 text-sm">
                            <Badge variant="outline" className="flex-shrink-0 text-xs">{item.type === "analysis" ? "Анализ" : item.type === "specialist" ? "Врач" : "Обслед."}</Badge>
                            <div><p className="font-medium">{item.name}</p><p className="text-muted-foreground">{item.reason}</p></div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                {aiAnalysis.missing_documents?.length ? (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">⚠ Отсутствующие документы</CardTitle></CardHeader>
                    <CardContent><ul className="text-sm space-y-1 list-disc list-inside">{aiAnalysis.missing_documents.map((d, i) => <li key={i}>{d}</li>)}</ul></CardContent>
                  </Card>
                ) : null}
                {aiAnalysis.lawyer_recommendations?.length ? (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">⚖️ Рекомендации для юриста</CardTitle></CardHeader>
                    <CardContent><ol className="text-sm space-y-1 list-decimal list-inside">{aiAnalysis.lawyer_recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol></CardContent>
                  </Card>
                ) : null}
                {aiAnalysis.risks?.length ? (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Риски</CardTitle></CardHeader>
                    <CardContent><ul className="text-sm space-y-1 list-disc list-inside">{aiAnalysis.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></CardContent>
                  </Card>
                ) : null}
                {aiAnalysis.raw && <Card><CardContent className="p-4 text-sm whitespace-pre-wrap">{aiAnalysis.raw}</CardContent></Card>}
              </div>
            )}
          </TabsContent>

          {/* ── TAB: Notes ───────────────────────────────────────────────── */}
          <TabsContent value="timeline" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Добавить заметку..." rows={2} className="flex-1" />
                  <Button onClick={addNote} disabled={addingNote || !newNote.trim()} size="icon" className="h-auto">
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {notes.map((note) => {
                if (note.note_type === "ai_analysis") {
                  let analysis: AIAnalysis = {};
                  try { analysis = JSON.parse(note.content); } catch { analysis = { raw: note.content }; }
                  return (
                    <Collapsible key={note.id}>
                      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between px-4 py-3 hover:bg-primary/10 transition-colors">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-primary flex-shrink-0" />
                              <span className="font-semibold text-sm text-primary">ИИ-анализ</span>
                              {analysis.overall_category && (
                                <Badge className="text-xs bg-primary text-white">{analysis.overall_category}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString("ru-RU")}</span>
                              <ChevronDown className="h-4 w-4 text-primary transition-transform [[data-state=open]_&]:rotate-180" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4 space-y-3 border-t border-primary/10">
                            {analysis.category_basis && (
                              <p className="text-sm text-muted-foreground pt-3">{stripMarkdown(analysis.category_basis)}</p>
                            )}
                            {analysis.strong_points?.length ? (
                              <div>
                                <p className="text-xs font-semibold text-green-600 mb-1">Сильные стороны</p>
                                <ul className="text-sm space-y-0.5 list-disc list-inside">
                                  {analysis.strong_points.map((p, i) => <li key={i}>{stripMarkdown(p)}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analysis.weak_points?.length ? (
                              <div>
                                <p className="text-xs font-semibold text-red-600 mb-1">Слабые стороны</p>
                                <ul className="text-sm space-y-0.5 list-disc list-inside">
                                  {analysis.weak_points.map((p, i) => <li key={i}>{stripMarkdown(p)}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analysis.examination_plan?.length ? (
                              <div>
                                <p className="text-xs font-semibold mb-1">План дообследования</p>
                                <ul className="text-sm space-y-0.5 list-disc list-inside">
                                  {analysis.examination_plan.map((item, i) => <li key={i}>{stripMarkdown(item.name)} — {stripMarkdown(item.reason)}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analysis.missing_documents?.length ? (
                              <div>
                                <p className="text-xs font-semibold text-amber-600 mb-1">Отсутствующие документы</p>
                                <ul className="text-sm space-y-0.5 list-disc list-inside">
                                  {analysis.missing_documents.map((d, i) => <li key={i}>{stripMarkdown(d)}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analysis.lawyer_recommendations?.length ? (
                              <div>
                                <p className="text-xs font-semibold mb-1">Рекомендации для юриста</p>
                                <ol className="text-sm space-y-0.5 list-decimal list-inside">
                                  {analysis.lawyer_recommendations.map((r, i) => <li key={i}>{stripMarkdown(r)}</li>)}
                                </ol>
                              </div>
                            ) : null}
                            {analysis.risks?.length ? (
                              <div>
                                <p className="text-xs font-semibold text-red-600 mb-1">Риски</p>
                                <ul className="text-sm space-y-0.5 list-disc list-inside">
                                  {analysis.risks.map((r, i) => <li key={i}>{stripMarkdown(r)}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analysis.raw && <p className="text-sm text-muted-foreground">{stripMarkdown(analysis.raw)}</p>}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                }
                return (
                  <div key={note.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex-shrink-0 mt-0.5">
                      {note.note_type === "stage_change" ? <AlertCircle className="h-4 w-4 text-blue-500" />
                        : note.note_type === "reminder" ? <Clock className="h-4 w-4 text-amber-500" />
                        : <ClipboardList className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(note.created_at).toLocaleString("ru-RU")}</p>
                    </div>
                  </div>
                );
              })}
              {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Заметок пока нет</p>}
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />

      {/* ── Templates Picker: подставит данные клиента ─────────────────── */}
      <TemplatePickerDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        isPro={isPro}
        prefillSource={client ? {
          client_name: client.client_name,
          client_phone: client.client_phone,
          client_email: client.client_email,
          client_birth_year: client.client_birth_year,
          conscription_date: client.conscription_date,
          diagnosis: client.diagnosis,
          expected_category: client.expected_category,
          client_address: clientAddress,
        } as ClientPrefillSource : null}
      />

      {/* ── Document Preview Dialog ─────────────────────────────────────── */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) { setPreviewDoc(null); setPreviewSignedUrl(null); } }}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base truncate">{previewDoc?.title}</DialogTitle>
              {previewSignedUrl && (
                <a
                  href={previewSignedUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Скачать
                  </Button>
                </a>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {previewLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {!previewLoading && !previewSignedUrl && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Не удалось загрузить документ
              </div>
            )}
            {previewSignedUrl && previewDoc && (
              extractFilePath(previewDoc.file_url).toLowerCase().endsWith(".docx")
                ? <DocxViewer url={previewSignedUrl} />
                : <PdfViewer url={previewSignedUrl} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyerClientDetail;
