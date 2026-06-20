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
import { ToastAction } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { getSignedDocumentUrl, extractFilePath } from "@/lib/storage";
import { extractFnError } from "@/lib/edgeError";
import PdfViewer from "@/components/PdfViewer";
import DocxViewer from "@/components/DocxViewer";
import {
  ArrowLeft, Save, MessageSquare, Brain, FileText, User,
  Phone, Calendar, AlertCircle, CheckCircle, Clock,
  ClipboardList, Plus, Loader2, Eye, Download, Trophy, ChevronDown,
  ShieldCheck, Lock, FileSignature, MoreVertical, UserMinus, Trash2, AlertTriangle,
  ArrowRight, ListChecks, Copy,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LawyerClientDocsUploader from "@/components/LawyerClientDocsUploader";
import ClientProfileEditor from "@/components/ClientProfileEditor";
import { CRM_STAGES } from "@/lib/crmStages";
import LawyerUpgradeDialog from "@/components/LawyerUpgradeDialog";
import LawyerDossierExportButton from "@/components/LawyerDossierExportButton";
import LawyerShareLinkCard from "@/components/LawyerShareLinkCard";
import LawyerCaseStrategyFlow from "@/components/LawyerCaseStrategyFlow";

const stripMarkdown = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")
   .replace(/#+\s*/g, "").replace(/_{1,2}(.+?)_{1,2}/g, "$1").trim();

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
  const { profile, isLawyer, isPro, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [client, setClient] = useState<Record<string, any> | null>(null);
  const [clearingEscalation, setClearingEscalation] = useState(false);

  const handleClearEscalation = async () => {
    setClearingEscalation(true);
    const { error } = await (supabase as any).rpc("lawyer_clear_escalation", {
      p_lawyer_client_id: clientId,
    });
    setClearingEscalation(false);
    if (error) {
      toast({ title: "Не удалось обновить", description: error.message, variant: "destructive" });
      return;
    }
    setClient((prev: any) => ({ ...prev, escalation_requested: false }));
    // Следующий шаг очевиден — даём его одной кнопкой прямо в тосте.
    toast({
      title: "Взято в работу",
      description: "Запрос снят. Свяжитесь с клиентом в чате.",
      action: (
        <ToastAction altText="Открыть чат" onClick={() => navigate(`/lawyer/chat/${clientId}`)}>
          Открыть чат
        </ToastAction>
      ),
    });
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [medDocs, setMedDocs] = useState<MedDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [hasDocAccess, setHasDocAccess] = useState(false);

  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [savingStage, setSavingStage] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const [newDocsDetected, setNewDocsDetected] = useState(false);

  // Ready-check: оценка готовности пакета к военкомату (% + чек-лист)
  const [readyCheck, setReadyCheck] = useState<{
    score: number; verdict?: string; strong?: string[]; missing?: string[]; next_actions?: string[];
  } | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);

  const runReadyCheck = async () => {
    if (!isPro) { setUpgradeOpen(true); return; }
    setReadyLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-ready-check", {
        body: { lawyerClientId: clientId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractFnError(res.error));
      setReadyCheck(res.data);
      toast({ title: `Готовность: ${res.data.score}%` });
    } catch (e) {
      toast({ title: "Ошибка ИИ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
    setReadyLoading(false);
  };

  const [previewDoc, setPreviewDoc] = useState<{ title: string; file_url: string } | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Полный профиль привязанного клиента (всё, что он заполнил на /profile:
  // паспорт, адреса, военкомат, образование, работа). Только при активном
  // доступе — RLS «Lawyers can view linked client profiles» гейтит по
  // client_document_access.is_active. Read-only, для вкладки «Обзор».
  const [clientProfile, setClientProfile] = useState<Record<string, any> | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "unlink" | "delete">(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  // Имя привязанного клиента из profiles (если доступно). Используем ТОЛЬКО
  // для отображения «Клиент привязан к аккаунту "ФИО"». Если профиля нет
  // (анонимный auth / RLS / триггер create_profile не сработал) — это нормально,
  // привязка остаётся валидной, просто покажем имя из lawyer_clients.client_name.
  const [linkedProfileName, setLinkedProfileName] = useState<string | null>(null);

  // Логика invite-кода (копирование, регенерация, шаринг в WhatsApp/Telegram/email)
  // переехала в reusable-компонент InviteCodeCard — здесь только колбэк для
  // синхронизации стейта при обновлении кода.

  // Отвязать аккаунт клиента: карточка остаётся в CRM как анонимная запись
  // (история дела сохраняется), но client_user_id → NULL, доступ закрыт,
  // генерируется новый invite_code — юрист может пригласить снова.
  const handleUnlinkClient = async () => {
    setActionBusy(true);
    const { data, error } = await supabase.rpc("lawyer_unlink_client", {
      p_lawyer_client_id: clientId,
    });
    setActionBusy(false);
    if (error) {
      toast({ title: "Не удалось отвязать", description: error.message, variant: "destructive" });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setConfirmAction(null);
    setClient((prev: any) => ({
      ...prev,
      client_user_id: null,
      invite_code: row?.new_invite_code ?? prev?.invite_code,
    }));
    setHasDocAccess(false);
    setMedDocs([]);
    setClientProfile(null);
    setLinkedProfileName(null);
    toast({
      title: "Аккаунт клиента отвязан",
      description: "Карточка осталась в CRM. Чтобы пригласить снова — отправьте новый код.",
    });
  };

  // Убрать клиента в архив (soft-archive: lawyer_delete_client переводит
  // карточку в link_state='archived', закрывает доступ, обнуляет invite_code).
  // История чата, заметки и сканы СОХРАНЯЮТСЯ — это не безвозвратное удаление.
  const handleDeleteClient = async () => {
    setActionBusy(true);
    const { error } = await supabase.rpc("lawyer_delete_client", {
      p_lawyer_client_id: clientId,
    });
    setActionBusy(false);
    if (error) {
      toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Клиент убран в архив", description: "История дела сохранена. Доступ к документам закрыт." });
    navigate("/lawyer/clients", { replace: true });
  };

  // Запросить у клиента доступ к документам: отправляем сообщение в чат и
  // ведём юриста туда. Не форсирует доступ — клиент откроет его кнопкой в чате.
  const requestDocAccess = async () => {
    if (!clientId || requestingAccess) return;
    setRequestingAccess(true);
    const { error } = await supabase.from("lawyer_chat_messages").insert({
      lawyer_client_id: clientId,
      sender_id: user!.id,
      content: "Здравствуйте! Чтобы я мог разобрать вашу ситуацию и подготовить позицию, откройте, пожалуйста, доступ к медицинским документам — кнопка «Открыть доступ» вверху этого чата (или раздел «Доступ юриста к данным» в личном кабинете). Доступ можно отозвать в любой момент.",
      message_type: "text",
    });
    setRequestingAccess(false);
    if (error) {
      toast({ title: "Не удалось отправить запрос", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Запрос на доступ отправлен", description: "Сообщение появилось в чате с клиентом." });
    navigate(`/lawyer/chat/${clientId}`);
  };

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
    if (data.client_user_id) {
      loadMedDocs(data.client_user_id);
      loadLinkedProfileName(data.client_user_id);
    } else {
      setLinkedProfileName(null);
    }
  };

  // Подтягиваем ФИО привязанного клиента, если оно есть в profiles.
  // Если нет (анонимный юзер, не сработавший триггер create_profile, RLS
  // не отдаёт чужой профиль) — это НЕ ошибка и НЕ «сирота». Просто
  // оставляем null и потом фолбэчимся на lawyer_clients.client_name.
  const loadLinkedProfileName = async (clientUserId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", clientUserId)
      .maybeSingle();
    setLinkedProfileName((data as any)?.full_name ?? null);
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

      // Полный профиль клиента из его кабинета — и для авто-подстановки в
      // шаблоны (адрес), и для read-only показа во вкладке «Обзор».
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", clientUserId)
        .maybeSingle();
      if (prof) {
        setClientProfile(prof as Record<string, any>);
      } else {
        setClientProfile(null);
      }
    } else {
      // Доступ закрыт — профиль клиента показывать нельзя.
      setClientProfile(null);
    }
    setDocsLoading(false);
  };

  const loadNotes = async () => {
    // 1. Базовые заметки + изменения этапов + сохранённые AI-анализы.
    const { data: rawNotes } = await supabase
      .from("case_notes").select("*")
      .eq("lawyer_client_id", clientId)
      .order("created_at", { ascending: false });
    const baseNotes = (rawNotes as CaseNote[]) || [];

    // 2. События документов (загруженные юристом) — превращаем в виртуальные заметки.
    const { data: lawyerDocs } = await supabase
      .from("lawyer_client_med_docs")
      .select("id, title, created_at")
      .eq("lawyer_client_id", clientId)
      .order("created_at", { ascending: false });

    const docNotes: CaseNote[] = (lawyerDocs || []).map((d: any) => ({
      id: `doc-${d.id}`,
      content: `📎 Загружен документ: ${d.title || "без названия"}`,
      note_type: "document_added",
      created_at: d.created_at,
    }));

    // 3. Использование шаблонов.
    const { data: tplUses } = await supabase
      .from("lawyer_template_uses")
      .select("id, template_key, created_at")
      .eq("lawyer_client_id", clientId)
      .order("created_at", { ascending: false });

    const tplNotes: CaseNote[] = (tplUses || []).map((t: any) => ({
      id: `tpl-${t.id}`,
      content: `📄 Сформирован документ по шаблону: ${t.template_key}`,
      note_type: "template_used",
      created_at: t.created_at,
    }));

    // 4. Объединяем и сортируем по дате (новые сверху).
    const all = [...baseNotes, ...docNotes, ...tplNotes]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    setNotes(all);

    // Restore the most recent AI analysis so it persists across tab switches / page reloads
    const lastAiNote = baseNotes.find(n => n.note_type === "ai_analysis");
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

  // Realtime: клиент включил/выключил доступ из своего кабинета.
  // Юристу сразу всплывает toast, перезагружается hasDocAccess и (если открыл)
  // подтягиваются документы — без F5.
  useEffect(() => {
    if (!client?.client_user_id || !user) return;
    const uid = client.client_user_id;
    const channel = supabase.channel(`accessGrants-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_document_access",
          filter: `client_user_id=eq.${uid}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as { lawyer_id?: string; is_active?: boolean };
          if (!row || row.lawyer_id !== user.id) return;

          const isActive = (payload.new as any)?.is_active === true;
          setHasDocAccess(isActive);

          if (isActive) {
            toast({
              title: "Клиент открыл доступ ✓",
              description: "Документы и ИИ-анализы доступны для просмотра.",
            });
            loadMedDocs(uid);
          } else {
            toast({
              title: "Клиент закрыл доступ",
              description: "Документы и ИИ-анализы больше не видны.",
              variant: "destructive",
            });
            setMedDocs([]);
            setClientProfile(null);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.client_user_id, user?.id, clientId]);

  // Realtime: лента дела (case_notes) — смена этапа, ИИ-анализ, ручные заметки
  // обновляются без F5. Требует case_notes в supabase_realtime
  // (миграция 20260527008000_realtime_case_data.sql).
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase.channel(`caseNotes-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_notes", filter: `lawyer_client_id=eq.${clientId}` },
        () => { loadNotes(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
        // Дублируем смену этапа системным сообщением в чат — клиент видит её
        // прямо в переписке («единая лента дела»).
        await (supabase as any).from("lawyer_chat_messages").insert({
          lawyer_client_id: clientId, sender_id: user!.id,
          message_type: "system",
          content: `Этап дела изменён: ${CRM_STAGES.find((s) => s.value === prevStage)?.label || prevStage} → ${CRM_STAGES.find((s) => s.value === form.crm_stage)?.label || form.crm_stage}`,
        });
        loadNotes();
      }
      toast({ title: "Сохранено" });
    }
    setSaving(false);
  };

  // «Мост» case_events ↔ crm_stage: смена этапа в один клик прямо из карточки.
  // Сразу пишет в ленту дела (case_notes) и системным сообщением в чат —
  // клиент видит прогресс без отдельного «Сохранить».
  const quickSetStage = async (newStage: string) => {
    if (!clientId || newStage === form.crm_stage) return;
    setSavingStage(true);
    const prevStage = form.crm_stage;
    const { error } = await supabase.from("lawyer_clients").update({ crm_stage: newStage }).eq("id", clientId);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      setSavingStage(false);
      return;
    }
    setClient((prev) => ({ ...prev, crm_stage: newStage }));
    setForm((f) => ({ ...f, crm_stage: newStage }));
    const label = (v?: string) => CRM_STAGES.find((s) => s.value === v)?.label || v;
    await supabase.from("case_notes").insert({
      lawyer_client_id: clientId, author_id: user!.id,
      content: `Этап изменён: ${label(prevStage)} → ${label(newStage)}`,
      note_type: "stage_change",
    });
    await (supabase as any).from("lawyer_chat_messages").insert({
      lawyer_client_id: clientId, sender_id: user!.id, message_type: "system",
      content: `Этап дела изменён: ${label(prevStage)} → ${label(newStage)}`,
    });
    loadNotes();
    toast({ title: "Этап обновлён", description: label(newStage) });
    setSavingStage(false);
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
    if (!isPro) { setUpgradeOpen(true); return; }
    setAiLoading(true); setAiError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-analyze-client", {
        body: { lawyerClientId: clientId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractFnError(res.error));
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

  // Удалить сохранённый ИИ-анализ (case_notes ai_analysis) и убрать его с экрана —
  // например, когда документы клиента удалены и прежний вывод устарел.
  const clearAnalysis = async () => {
    const { error } = await supabase
      .from("case_notes")
      .delete()
      .eq("lawyer_client_id", clientId)
      .eq("note_type", "ai_analysis");
    if (error) { toast({ title: "Не удалось очистить", description: error.message, variant: "destructive" }); return; }
    setAiAnalysis(null);
    setLastAnalysisAt(null);
    setNewDocsDetected(false);
    setAiError("");
    loadNotes();
    toast({ title: "Анализ удалён", description: "Запустите новый анализ после загрузки актуальных документов." });
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

  const bestDocument = [...medDocs]
    .filter((doc) => doc.ai_category_chance !== null || doc.ai_fitness_category)
    .sort((a, b) => (b.ai_category_chance || 0) - (a.ai_category_chance || 0))[0];
  const daysUntilConscription = client?.conscription_date
    ? Math.ceil((new Date(client.conscription_date).getTime() - Date.now()) / 86400000)
    : null;
  const urgentByDate = daysUntilConscription !== null && daysUntilConscription <= 14;
  const lawyerNextActions = [
    !client?.client_user_id ? "Отправьте клиенту код или ссылку, чтобы он привязал кабинет." : null,
    client?.client_user_id && !hasDocAccess ? "Запросите доступ к досье: без него не видно меддокументы и AI-анализы." : null,
    hasDocAccess && medDocs.length === 0 ? "Попросите клиента загрузить первые медицинские документы." : null,
    hasDocAccess && medDocs.length > 0 && !bestDocument ? "Запустите AI-анализ документов или полный анализ дела." : null,
    !form.conscription_date ? "Поставьте ближайшую дату комиссии, суда или призыва." : null,
    form.priority === "urgent" || urgentByDate ? "Зафиксируйте срочный план: что сделать сегодня, завтра и до комиссии." : null,
  ].filter((item): item is string => Boolean(item));

  // Продублировать данные клиента из его профиля (+ ожидаемую категорию из лучшего
  // меддокумента) в карточку CRM. Заполняем только ПУСТЫЕ поля и сразу сохраняем.
  // Email и диагноз в профиле клиента не хранятся — их юрист вносит вручную.
  const fillFromClientProfile = async () => {
    if (!clientProfile) return;
    const p = clientProfile;
    const year = p.birth_date ? String(new Date(p.birth_date).getFullYear()) : "";
    const next = {
      client_name: form.client_name || p.full_name || "",
      client_phone: form.client_phone || p.phone || "",
      client_birth_year: form.client_birth_year || year,
      expected_category: form.expected_category || bestDocument?.ai_fitness_category || "",
    };
    const added: string[] = [];
    if (!form.client_name && next.client_name) added.push("ФИО");
    if (!form.client_phone && next.client_phone) added.push("телефон");
    if (!form.client_birth_year && next.client_birth_year) added.push("год рождения");
    if (!form.expected_category && next.expected_category) added.push("ожидаемую категорию");
    const { error } = await supabase.from("lawyer_clients").update({
      client_name: next.client_name || null,
      client_phone: next.client_phone || null,
      client_birth_year: next.client_birth_year ? parseInt(next.client_birth_year) : null,
      expected_category: next.expected_category || null,
    }).eq("id", clientId);
    if (error) { toast({ title: "Не удалось сохранить", description: error.message, variant: "destructive" }); return; }
    setForm((f) => ({ ...f, ...next }));
    setClient((prev) => ({ ...prev, ...next, client_birth_year: next.client_birth_year ? parseInt(next.client_birth_year) : null }));
    toast({
      title: added.length ? "Данные продублированы в карточку" : "Нечего дублировать",
      description: added.length
        ? `Заполнено: ${added.join(", ")}. Email и диагноз в профиле клиента не хранятся — при необходимости добавьте вручную.`
        : "В профиле клиента нет данных, которых ещё нет в карточке.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 min-w-0 sm:flex-1">
            <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => navigate("/lawyer/clients")}><ArrowLeft className="h-5 w-5" /></Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate sm:whitespace-normal sm:break-words" title={client?.client_name}>{client?.client_name}</h1>
              <p className="text-sm text-muted-foreground">
                {CRM_STAGES.find((s) => s.value === client?.crm_stage)?.label}
                {client?.case_won && " · ВБ получен ✓"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:ml-auto">
            {!client?.case_won && (
              <Button variant="outline" size="sm" className="text-green-600 border-green-300" onClick={handleMarkWon}>
                <Trophy className="h-4 w-4 mr-1" />ВБ получен
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate(`/lawyer/templates?client=${clientId}`)}>
              <FileSignature className="h-4 w-4 mr-1" />Из шаблона
            </Button>
            {client && (
              <LawyerDossierExportButton
                lawyerClientId={clientId!}
                client={client as any}
                hasDocAccess={hasDocAccess}
                lawyerName={profile?.full_name || null}
                size="sm"
              />
            )}
            <Button size="sm" variant="outline" onClick={() => navigate(`/lawyer/chat/${clientId}`)}>
              <MessageSquare className="h-4 w-4 mr-1" />Чат
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Сохранить
            </Button>
            {/* Меню деструктивных действий — отдельный dropdown, чтобы не
                стояли «опасные» кнопки рядом с обычным «Сохранить». */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Действия">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {client?.client_user_id && (
                  <>
                    <DropdownMenuItem onClick={() => setConfirmAction("unlink")}>
                      <UserMinus className="h-4 w-4 mr-2 text-amber-600" />
                      Отвязать аккаунт клиента
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => setConfirmAction("delete")}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Убрать клиента в архив
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {client?.escalation_requested && (
          <Card className="mb-4 border-rose-300 bg-rose-50 dark:bg-rose-950/30">
            <CardContent className="py-3 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  Клиент просит подключения живого юриста
                </span>
                <span className="text-muted-foreground">
                  {" "}— дело передано из ИИ-чата. Сводка диалога — во вкладке «История».
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearEscalation}
                disabled={clearingEscalation}
                className="flex-shrink-0"
              >
                {clearingEscalation ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Взять в работу
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Шапка ключевых фактов — read-only, видна на ВСЕХ вкладках (Этап 3).
            Раньше диагноз/категория/дата призыва жили только во вкладке «Обзор»
            как инпуты — на других вкладках их не было видно. */}
        {client && (
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
              <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="flex-shrink-0 text-muted-foreground">Диагноз:</span>
              <span className="min-w-0 truncate font-medium">{client.diagnosis || "—"}</span>
            </span>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
              <span className="flex-shrink-0 text-muted-foreground">Категория:</span>
              <span className="min-w-0 truncate font-medium">{client.expected_category || "—"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Призыв:</span>
              <span className="font-medium">
                {(() => {
                  if (!client.conscription_date) return "—";
                  const d = new Date(client.conscription_date);
                  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
                  const ds = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
                  return days < 0 ? `${ds} · прошёл` : days === 0 ? `${ds} · сегодня` : `${ds} · через ${days} дн.`;
                })()}
              </span>
            </span>
            {client.client_birth_year && (
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
                <span className="text-muted-foreground">Г.р.:</span>
                <span className="font-medium">{client.client_birth_year}</span>
              </span>
            )}
          </div>
        )}

        {/* Статус привязки — полный switch по link_state.
            Один источник правды о связи: либо LawyerShareLinkCard (когда клиент
            ещё не подключился / отвязался — нужно дать ссылку для подключения),
            либо статус-плашка. Кодов больше нет — связь инициирует клиент. */}
        <div className="mb-4">
          {(() => {
            const state = client?.link_state || (client?.client_user_id ? "linked_active" : "unlinked");

            // Линкед — единственный «живой» зелёный статус.
            if (state === "linked_active") {
              return (
                <div className="rounded-lg border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 flex-1 min-w-0">
                    Клиент привязан к аккаунту
                    {(linkedProfileName || (client?.client_name && !/^Клиент #/.test(client.client_name))) && (
                      <> <strong>«{linkedProfileName || client.client_name}»</strong></>
                    )}.
                    Доступ к документам, ИИ-анализам и чату — открыт.
                  </p>
                  <Button
                    variant="ghost" size="sm"
                    className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-300 flex-shrink-0"
                    onClick={() => setConfirmAction("unlink")}
                    title="Отвязать аккаунт — карточка останется в CRM, сгенерируется новый код"
                  >
                    <UserMinus className="h-3.5 w-3.5 mr-1.5" /> Отвязать
                  </Button>
                </div>
              );
            }

            // Pending — запрос отправлен на email, ждём accept от клиента.
            if (state === "pending_client_approval") {
              return (
                <div className="rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                      Запрос отправлен — ждём подтверждения
                    </p>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                    Клиент увидит ваш запрос в своём кабинете
                    {client?.target_email ? <> на адресе <strong>{client.target_email}</strong></> : null}{" "}
                    и подтвердит подключение одной кнопкой. Доступ к документам и ИИ-анализам
                    откроется автоматически.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline" size="sm"
                      onClick={async () => {
                        const { error } = await supabase.functions.invoke("lawyer-send-invite", {
                          body: { lawyerClientId: clientId },
                        });
                        if (error) {
                          toast({ title: "Не удалось отправить", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: "Письмо отправлено повторно" });
                        }
                      }}
                    >
                      Отправить ещё раз
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="text-muted-foreground"
                      onClick={async () => {
                        const { error } = await supabase.rpc("lawyer_revoke_request", { p_lawyer_client_id: clientId });
                        if (error) {
                          toast({ title: "Не удалось отозвать", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: "Запрос отозван" });
                          navigate("/lawyer/clients", { replace: true });
                        }
                      }}
                    >
                      Отозвать запрос
                    </Button>
                  </div>
                </div>
              );
            }

            // Declined — клиент отклонил. Можно или удалить карточку, или повторить (создать новый запрос).
            if (state === "declined") {
              return (
                <div className="rounded-lg border border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                    <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
                      Клиент отклонил запрос
                    </p>
                  </div>
                  <p className="text-xs text-rose-800 dark:text-rose-300">
                    Карточка осталась в CRM как архивная. Если это была ошибка — обсудите с клиентом
                    и отправьте новый запрос через «Добавить клиента» в списке CRM.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost" size="sm" className="text-destructive"
                      onClick={() => setConfirmAction("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Убрать в архив
                    </Button>
                  </div>
                </div>
              );
            }

            // unlinked_by_client / unlinked_by_lawyer — связь была, но порвалась.
            // Показываем причину + invite-код для повторного приглашения.
            if (state === "unlinked_by_client" || state === "unlinked_by_lawyer") {
              const byClient = state === "unlinked_by_client";
              const when = client?.unlinked_at
                ? new Date(client.unlinked_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                : null;
              return (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3">
                    <UserMinus className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {byClient ? "Клиент отвязался" : "Вы отвязали клиента"}
                        {when ? ` · ${when}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        История чата и заметки сохранены. Чтобы возобновить работу — отправьте
                        клиенту ссылку для подключения, он снова откроет доступ.
                      </p>
                    </div>
                  </div>
                  <LawyerShareLinkCard lawyerUserId={user!.id} slug={(profile as any)?.slug} />
                </div>
              );
            }

            // Archived — soft-delete. Карточка читается только как историческая.
            if (state === "archived") {
              return (
                <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
                  <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground flex-1">
                    Карточка в архиве. История дела сохранена, но клиент к ней больше не привязан.
                  </p>
                </div>
              );
            }

            // unlinked — клиент ещё не подключился. Даём ссылку для подключения
            // (client-initiated): клиент откроет её и включит доступ сам.
            return <LawyerShareLinkCard lawyerUserId={user!.id} slug={(profile as any)?.slug} />;
          })()}
        </div>

        <Card className="mb-4 border-gold/30 bg-gradient-to-br from-gold/5 via-card to-background">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="section-number mb-1">CRM · рабочая сводка</p>
                <CardTitle className="text-lg font-serif">Что делать с этим клиентом дальше</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={urgentByDate || form.priority === "urgent" ? "destructive" : "outline"}>
                  {urgentByDate
                    ? `Срок: ${daysUntilConscription} дн.`
                    : form.conscription_date
                      ? "Дата указана"
                      : "Нет дедлайна"}
                </Badge>
                <Badge variant={hasDocAccess ? "outline" : "secondary"}>
                  {hasDocAccess ? `${medDocs.length} док.` : "Доступ закрыт"}
                </Badge>
                <Badge variant="outline">
                  {bestDocument?.ai_fitness_category ? `Кат. ${bestDocument.ai_fitness_category}` : "AI без вывода"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Позиция</p>
                <p className="mt-1 text-sm font-semibold">
                  {bestDocument
                    ? `${bestDocument.ai_category_chance ?? 0}% по лучшему документу`
                    : "Недостаточно данных"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {bestDocument?.title || "Нужны документы клиента или полный анализ дела."}
                </p>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Связь</p>
                <p className="mt-1 text-sm font-semibold">
                  {client?.client_user_id ? "Кабинет привязан" : "Клиент еще вне кабинета"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasDocAccess
                    ? "Можно смотреть документы и готовить позицию."
                    : "Доступ к документам нужно получить отдельно."}
                </p>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Следующий шаг</p>
                <p className="mt-1 text-sm font-semibold">
                  {lawyerNextActions[0] || "Можно переходить к документам"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Сводка помогает не открывать все вкладки перед каждым ответом клиенту.
                </p>
              </div>
            </div>

            {lawyerNextActions.length > 0 && (
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-gold-deep" />
                  <p className="text-sm font-semibold">Короткий план</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {lawyerNextActions.slice(0, 4).map((action, index) => (
                    <div key={action} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[11px] font-semibold text-gold-deep">
                        {index + 1}
                      </span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {client?.client_user_id && !hasDocAccess && (
                <Button size="sm" onClick={requestDocAccess} disabled={requestingAccess}>
                  {requestingAccess ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1.5 h-4 w-4" />}
                  Запросить доступ
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate(`/lawyer/chat/${clientId}`)}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Написать клиенту
              </Button>
              <Button size="sm" variant="outline" onClick={runAiAnalysis} disabled={aiLoading || !isPro}>
                {aiLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Brain className="mr-1.5 h-4 w-4" />}
                Полный анализ
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/lawyer/templates?client=${clientId}`)}>
                Документ по шаблону
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          {/* На мобиле 5 вкладок не влезают — горизонтальный скролл вместо сжатия */}
          <TabsList className="mb-4 flex w-full justify-start overflow-x-auto scrollbar-hide sm:w-auto">
            <TabsTrigger value="overview"><User className="h-4 w-4 mr-1.5" />Обзор</TabsTrigger>
            <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1.5" />Документы</TabsTrigger>
            <TabsTrigger value="analysis"><Brain className="h-4 w-4 mr-1.5" />ИИ-анализ</TabsTrigger>
            <TabsTrigger value="strategy"><ListChecks className="h-4 w-4 mr-1.5" />Стратегия</TabsTrigger>
            <TabsTrigger value="timeline"><ClipboardList className="h-4 w-4 mr-1.5" />История</TabsTrigger>
          </TabsList>

          {/* ── TAB: Strategy (планировщик A3 + ассистент дела) ──────────── */}
          <TabsContent value="strategy" className="space-y-4">
            <LawyerCaseStrategyFlow lawyerClientId={clientId!} isPro={isPro} onUpgrade={() => setUpgradeOpen(true)} />
          </TabsContent>

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
                    <Button
                      size="sm" className="mt-3 gap-1.5"
                      onClick={requestDocAccess} disabled={requestingAccess}
                    >
                      {requestingAccess ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      Запросить доступ в чате
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hasDocAccess && clientProfile && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={fillFromClientProfile}>
                        <Copy className="h-3.5 w-3.5" /> Дублировать из профиля клиента
                      </Button>
                    )}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div><Label>ФИО</Label><Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} /></div>
                      <div><Label>Телефон</Label><Input value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} /></div>
                      <div><Label>Год рождения</Label><Input type="number" value={form.client_birth_year} onChange={(e) => setForm((f) => ({ ...f, client_birth_year: e.target.value }))} /></div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Полный профиль клиента из его личного кабинета (/profile). Виден ТОЛЬКО
                когда клиент привязан И открыл доступ (RLS гейтит по client_document_access).
                Юрист может заполнить/поправить данные за клиента (если тот не заполнил) —
                запись в profiles (RLS «Lawyer updates granted client profile»). */}
            {client?.client_user_id && hasDocAccess && clientProfile && (
              <ClientProfileEditor
                profile={clientProfile}
                clientUserId={client.client_user_id}
                onSaved={(u) => setClientProfile((prev) => ({ ...(prev || {}), ...u }))}
              />
            )}

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
                  {(() => {
                    const i = CRM_STAGES.findIndex((s) => s.value === form.crm_stage);
                    return (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Button
                          type="button" variant="outline" size="sm" className="h-8 gap-1"
                          disabled={savingStage || i <= 0}
                          onClick={() => i > 0 && quickSetStage(CRM_STAGES[i - 1].value)}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" /> Назад
                        </Button>
                        <Button
                          type="button" size="sm" className="h-8 gap-1"
                          disabled={savingStage || i < 0 || i >= CRM_STAGES.length - 1}
                          onClick={() => i >= 0 && i < CRM_STAGES.length - 1 && quickSetStage(CRM_STAGES[i + 1].value)}
                        >
                          {savingStage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Следующий этап <ArrowRight className="h-3.5 w-3.5" /></>}
                        </Button>
                        <span className="text-[11px] text-muted-foreground">в один клик · клиент увидит в чате</span>
                      </div>
                    );
                  })()}
                </div>
                <div><Label>Диагноз</Label><Input value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} /></div>
                <div><Label>Ожидаемая категория</Label><Input value={form.expected_category} onChange={(e) => setForm((f) => ({ ...f, expected_category: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label>Заметки</Label>
                  <Textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>

                {/* Invite-блок вынесен НАВЕРХ страницы — над табами, чтобы юрист
                    сразу видел код. См. рендер ниже над <Tabs>. */}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: Documents ───────────────────────────────────────────── */}
          <TabsContent value="documents">
            {!client?.client_user_id
              ? (
                  /* CRM-клиент без аккаунта — юрист сам загружает медкарту */
                  <LawyerClientDocsUploader
                    lawyerClientId={clientId!}
                    lawyerId={user!.id}
                    onPreview={openPreview}
                  />
                )
              : !hasDocAccess
                ? (
                    <Card><CardContent className="py-8 text-center">
                      <Clock className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                      <p className="font-medium">Доступ к документам не открыт</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">Клиент ещё не открыл доступ к медкартам и ИИ-анализу</p>
                      <Button size="sm" className="gap-1.5" onClick={requestDocAccess} disabled={requestingAccess}>
                        {requestingAccess ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                        Запросить доступ в чате
                      </Button>
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
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <p className="text-sm flex-1">
                    ИИ-анализ доступен в тарифе <strong>Pro</strong>. Получите комплексный разбор дела с категорией, рисками и планом действий.
                  </p>
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
                    onClick={() => setUpgradeOpen(true)}
                  >
                    Upgrade
                  </Button>
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
            {aiAnalysis && hasDocAccess && medDocs.length === 0 && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Документы клиента удалены</p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Анализ ниже построен по документам, которых больше нет, — он неактуален. Очистите его
                      или дождитесь новых документов и обновите анализ.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="flex-shrink-0" onClick={clearAnalysis}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Очистить анализ
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end gap-2 flex-wrap">
              {aiAnalysis && (
                <Button variant="ghost" onClick={clearAnalysis} className="text-muted-foreground">
                  <Trash2 className="h-4 w-4 mr-2" /> Очистить анализ
                </Button>
              )}
              <Button variant="outline" onClick={runReadyCheck} disabled={readyLoading || !isPro}>
                {readyLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Проверяю...</> : <><ShieldCheck className="h-4 w-4 mr-2" />Готовность к военкомату</>}
              </Button>
              <Button onClick={runAiAnalysis} disabled={aiLoading || !isPro}>
                {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Анализируем...</> : <><Brain className="h-4 w-4 mr-2" />Полный анализ дела</>}
              </Button>
            </div>

            {readyCheck && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Готовность пакета к военкомату
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 flex-shrink-0">
                      {/* Круговая шкала score */}
                      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${readyCheck.score} 100`}
                          className={readyCheck.score >= 70 ? "text-emerald-500" : readyCheck.score >= 40 ? "text-amber-500" : "text-red-500"}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold">{readyCheck.score}%</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">{readyCheck.verdict}</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {readyCheck.strong?.length ? (
                      <div>
                        <p className="text-xs font-semibold text-emerald-600 mb-1">✓ Сильные стороны пакета</p>
                        <ul className="text-sm space-y-0.5 list-disc list-inside">
                          {readyCheck.strong.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {readyCheck.missing?.length ? (
                      <div>
                        <p className="text-xs font-semibold text-amber-600 mb-1">⚠ Чего не хватает</p>
                        <ul className="text-sm space-y-0.5 list-disc list-inside">
                          {readyCheck.missing.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  {readyCheck.next_actions?.length ? (
                    <div>
                      <p className="text-xs font-semibold mb-1">Следующие шаги</p>
                      <ol className="text-sm space-y-0.5 list-decimal list-inside">
                        {readyCheck.next_actions.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
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
                        : note.note_type === "document_added" ? <FileText className="h-4 w-4 text-emerald-500" />
                        : note.note_type === "template_used" ? <FileSignature className="h-4 w-4 text-violet-500" />
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

      <LawyerUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        currentTier={isPro ? "pro" : "basic"}
      />

      {/* Подтверждение «Отвязать аккаунт» — оставляем карточку, чистим связь. */}
      <AlertDialog
        open={confirmAction === "unlink"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Отвязать аккаунт клиента?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>После отвязки:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Вы потеряете доступ к медицинским документам и ИИ-анализам клиента</li>
                  <li>Карточка дела с заметками и историей чата <strong>останется в CRM</strong></li>
                  <li>Будет сгенерирован новый код приглашения — можете пригласить клиента снова</li>
                </ul>
                <p className="pt-2 text-xs">
                  Если хотите удалить дело целиком — используйте «Удалить карточку клиента».
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleUnlinkClient(); }}
              disabled={actionBusy}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {actionBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserMinus className="h-4 w-4 mr-2" />}
              Отвязать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение «Убрать в архив» — soft-archive, история сохраняется. */}
      <AlertDialog
        open={confirmAction === "delete"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Убрать клиента в архив?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Карточка {client?.client_name ? <strong>«{client.client_name}»</strong> : "клиента"} уйдёт
                  в архив и пропадёт из списка активных клиентов.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>История чата, заметки и сканы документов <strong>сохранятся</strong> в архиве</li>
                  <li>Доступ к медкартам и ИИ-анализам клиента закроется</li>
                  <li>Привязка аккаунта снимется — чтобы вернуть клиента, понадобится новый код приглашения</li>
                </ul>
                <p className="pt-2 text-xs text-muted-foreground">
                  Это не безвозвратное удаление. Документы клиента в его собственном кабинете не пострадают.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteClient(); }}
              disabled={actionBusy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {actionBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Убрать в архив
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Document Preview Dialog ─────────────────────────────────────── */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) { setPreviewDoc(null); setPreviewSignedUrl(null); } }}>
        <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            {/* pr-9 оставляет место под штатный крестик закрытия диалога (absolute right-4),
                иначе кнопка «Скачать» наезжает на него (особенно заметно на мобиле). */}
            <div className="flex items-center justify-between gap-3 pr-9">
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
