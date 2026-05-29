import { useEffect, useRef, useState } from "react";
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
  LayoutList, KanbanSquare, BookOpen, Ticket, ShieldCheck, ShieldOff,
} from "lucide-react";
import DiseaseScheduleDrawer from "@/components/DiseaseScheduleDrawer";
import { CRM_STAGES, CRM_STAGE_BADGE_CLASS } from "@/lib/crmStages";
import InviteCodeCard from "@/components/InviteCodeCard";
import { useChatPresence } from "@/contexts/ChatPresenceContext";

interface LawyerClient {
  id: string; lawyer_id: string; client_user_id: string | null;
  client_name: string; client_phone: string | null; client_email: string | null;
  client_birth_year: number | null; crm_stage: string; diagnosis: string | null;
  expected_category: string | null; notes: string | null; priority: string;
  conscription_date: string | null; case_won: boolean; created_at: string; updated_at: string;
  // Новая модель связи (миграция 20260527005000):
  link_state?: string | null;
  escalation_requested?: boolean | null;
  invite_code?: string | null;
  target_email?: string | null;
  requested_at?: string | null;
  linked_at?: string | null;
  unlinked_at?: string | null;
  unlinked_by?: string | null;
}

const LawyerClientsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isLawyer, isPro, profile, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [clients, setClients] = useState<LawyerClient[]>([]);
  const [docAccessByClient, setDocAccessByClient] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  // filteredTotal — размер текущей (отфильтрованной) серверной выборки;
  // totalAll/archivedCount — общие счётчики для шапки и тоггла «архив».
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Непрочитанные — из единого ChatPresenceContext (один realtime-канал на всё
  // приложение), а не отдельным запросом по всем карточкам клиента.
  const { unreadByConv } = useChatPresence();
  const [stageFilter, setStageFilter] = useState(searchParams.get("stage") || "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  // По умолчанию архивные карточки (declined, unlinked_*, archived) скрыты —
  // юрист видит активную работу. Тоггл «Показать архив» — без localStorage,
  // чтобы каждое посещение CRM по умолчанию открывало рабочий список.
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("lawyer_clients_view") as "list" | "kanban") || "list";
  });
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  // Модалка с кодом приглашения, показываемая сразу после создания клиента —
  // юрист видит код, кнопки «Скопировать» / «WhatsApp» / «Telegram» в момент,
  // когда это нужно (не надо лезть в карточку и искать).
  const [createdInvite, setCreatedInvite] = useState<{
    lawyerClientId: string; code: string | null; clientName: string;
  } | null>(null);

  const [form, setForm] = useState({
    client_name: "", client_phone: "", client_email: "",
    client_birth_year: "", crm_stage: "initial_contact",
    diagnosis: "", expected_category: "", notes: "", priority: "normal",
    conscription_date: "", client_email_link: "",
  });

  const PAGE_SIZE = 30;
  const ACTIVE_LINK_STATE_FILTER = "link_state.is.null,link_state.in.(linked_active,code_sent,pending_client_approval,unlinked)";
  const ARCHIVED_LINK_STATE_FILTER = "(archived,declined,unlinked_by_client,unlinked_by_lawyer)";

  // Дебаунс поиска — серверный ilike дёргаем не на каждый символ.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Редирект не-юриста + общие счётчики (шапка, тоггл «архив»).
  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadCountsRef.current();
  }, [user, profileLoading, isLawyer, navigate]);

  // (Пере)загрузка первой страницы при смене любого серверного фильтра либо
  // режима (в канбане фильтр по этапу не применяется — доска показывает все).
  useEffect(() => {
    if (!user || profileLoading || !isLawyer) return;
    loadClients(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileLoading, isLawyer, stageFilter, priorityFilter, showArchived, debouncedSearch, viewMode]);

  // Realtime: клиент сам подключился из каталога / принял запрос / отвязался —
  // перезагружаем первую страницу текущей выборки без перезагрузки страницы.
  useEffect(() => {
    if (!user || !isLawyer) return;
    const ch = supabase
      .channel(`lawyer-clients-crm:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `lawyer_id=eq.${user.id}` },
        () => { loadCountsRef.current(); loadClientsRef.current(true); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isLawyer]);

  useEffect(() => {
    const lawyerId = user?.id;
    if (!lawyerId || clients.length === 0) {
      setDocAccessByClient({});
      return;
    }

    const clientUserIds = Array.from(
      new Set(clients.map((client) => client.client_user_id).filter(Boolean) as string[]),
    );
    if (clientUserIds.length === 0) {
      setDocAccessByClient({});
      return;
    }

    let cancelled = false;
    supabase
      .from("client_document_access")
      .select("client_user_id, is_active")
      .eq("lawyer_id", lawyerId)
      .in("client_user_id", clientUserIds)
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        (data || []).forEach((row) => {
          next[row.client_user_id] = !!row.is_active;
        });
        setDocAccessByClient(next);
      });

    return () => {
      cancelled = true;
    };
  }, [clients, user?.id]);

  // Серверные фильтры выборки. Поиск, этап (только список), приоритет, архив —
  // всё уходит в запрос, чтобы не тянуть всю таблицу в память при росте базы.
  type LawyerClientsQuery = {
    eq: (column: string, value: unknown) => LawyerClientsQuery;
    filter: (column: string, operator: string, value: string) => LawyerClientsQuery;
    gte: (column: string, value: unknown) => LawyerClientsQuery;
    lte: (column: string, value: unknown) => LawyerClientsQuery;
    order: (column: string, options?: { ascending?: boolean }) => LawyerClientsQuery;
    or: (filters: string) => LawyerClientsQuery;
    range: (from: number, to: number) => LawyerClientsQuery;
    then: PromiseLike<{ data: LawyerClient[] | null; count: number | null; error?: { message: string } | null }>["then"];
  };

  const lawyerClientsTable = (supabase as unknown as {
    from: (table: "lawyer_clients") => {
      select: (columns: string, options?: { count?: "exact"; head?: boolean }) => LawyerClientsQuery;
    };
  }).from("lawyer_clients");

  const applyFilters = <T extends LawyerClientsQuery>(q: T): T => {
    let query = q.eq("lawyer_id", user!.id) as T;
    if (!showArchived) {
      // В рабочем списке оставляем и старые unlinked-карточки: это обычные CRM-карточки
      // без привязанного кабинета, а не архив.
      query = query.or(ACTIVE_LINK_STATE_FILTER) as T;
    }
    if (viewMode === "list" && stageFilter !== "all") query = query.eq("crm_stage", stageFilter) as T;
    if (priorityFilter !== "all") query = query.eq("priority", priorityFilter) as T;
    const term = debouncedSearch.trim();
    if (term) {
      // Экранируем символы, ломающие синтаксис or()/ilike.
      const safe = term.replace(/[%,()]/g, " ");
      query = query.or(
        `client_name.ilike.%${safe}%,client_phone.ilike.%${safe}%,` +
          `client_email.ilike.%${safe}%,diagnosis.ilike.%${safe}%,expected_category.ilike.%${safe}%`,
      ) as T;
    }
    return query;
  };

  const loadCounts = async () => {
    try {
      const [allRes, archRes] = await Promise.all([
        lawyerClientsTable.select("*", { count: "exact", head: true }).eq("lawyer_id", user!.id),
        lawyerClientsTable.select("*", { count: "exact", head: true })
          .eq("lawyer_id", user!.id)
          .filter("link_state", "in", ARCHIVED_LINK_STATE_FILTER),
      ]);
      if (allRes.error) throw new Error(allRes.error.message);
      if (archRes.error) throw new Error(archRes.error.message);
      setTotalAll(allRes.count ?? 0);
      setArchivedCount(archRes.count ?? 0);
    } catch (error) {
      console.warn("Could not load lawyer client counts", error);
    }
  };

  const loadClients = async (reset: boolean) => {
    const nextPage = reset ? 0 : page + 1;
    if (reset) setLoading(true); else setLoadingMore(true);
    setLoadError(null);

    try {
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const pagePromise = applyFilters(lawyerClientsTable.select("*", { count: "exact" }))
        .order("updated_at", { ascending: false })
        .range(from, to);

      let rows: LawyerClient[] = [];
      let total = 0;
      if (reset) {
        // На первой странице дополнительно тянем «горящие» дела (≤14 дней до
        // призыва, не выиграно) — чтобы они не утонули на дальних страницах.
        // Клиентская сортировка ниже поднимет их наверх.
        const today = new Date().toISOString().slice(0, 10);
        const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        const [pageRes, burningRes] = await Promise.all([
          pagePromise,
          applyFilters(lawyerClientsTable.select("*"))
            .eq("case_won", false)
            .gte("conscription_date", today)
            .lte("conscription_date", in14),
        ]);
        if (pageRes.error) throw new Error(pageRes.error.message);
        if (burningRes.error) throw new Error(burningRes.error.message);
        rows = [...((pageRes.data as LawyerClient[]) || []), ...((burningRes.data as LawyerClient[]) || [])];
        total = pageRes.count ?? 0;
      } else {
        const pageRes = await pagePromise;
        if (pageRes.error) throw new Error(pageRes.error.message);
        rows = (pageRes.data as LawyerClient[]) || [];
        total = pageRes.count ?? 0;
      }

      setFilteredTotal(total);
      setClients((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((c) => c.id));
        const merged = [...base];
        rows.forEach((r) => { if (!seen.has(r.id)) { merged.push(r); seen.add(r.id); } });
        return merged;
      });
      setPage(nextPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить клиентов";
      setLoadError(message);
      if (reset) setClients([]);
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  };

  // Realtime-обработчик (канал подписан один раз) должен вызывать всегда свежие
  // loadClients/loadCounts — с текущими фильтрами, а не теми, что были на mount.
  const loadClientsRef = useRef(loadClients);
  const loadCountsRef = useRef(loadCounts);
  loadClientsRef.current = loadClients;
  loadCountsRef.current = loadCounts;

  const changeViewMode = (mode: "list" | "kanban") => {
    setViewMode(mode);
    try {
      localStorage.setItem("lawyer_clients_view", mode);
    } catch {
      console.warn("Could not persist lawyer clients view mode");
    }
  };

  const moveClientToStage = async (clientId: string, newStage: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client || client.crm_stage === newStage) return;

    // Оптимистичное обновление
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, crm_stage: newStage } : c)),
    );

    const { error } = await supabase
      .from("lawyer_clients")
      .update({ crm_stage: newStage })
      .eq("id", clientId);

    if (error) {
      // Откат при ошибке
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, crm_stage: client.crm_stage } : c)),
      );
      toast({ title: "Не удалось переместить", description: error.message, variant: "destructive" });
      return;
    }
    const newLabel = CRM_STAGES.find((s) => s.value === newStage)?.label || newStage;
    toast({ title: `${client.client_name} → ${newLabel}` });
  };

  const handleDragStart = (e: React.DragEvent, clientId: string) => {
    setDraggedClientId(clientId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", clientId);
  };

  const handleDragEnd = () => {
    setDraggedClientId(null);
    setDragOverStage(null);
  };

  const handleStageDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  };

  const handleStageDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const clientId = e.dataTransfer.getData("text/plain") || draggedClientId;
    setDragOverStage(null);
    setDraggedClientId(null);
    if (clientId) await moveClientToStage(clientId, stage);
  };

  const handleAdd = async () => {
    if (!form.client_name.trim()) {
      toast({ title: "Введите имя клиента", variant: "destructive" }); return;
    }
    const limit = profile?.clients_limit ?? 5;
    if (!isPro && totalAll >= limit) {
      toast({ title: `Лимит Basic: ${limit} клиентов. Upgrade до Pro`, variant: "destructive" }); return;
    }
    setSaving(true);

    // Шаг 1. Создаём карточку через RPC lawyer_request_client. RPC сам решит:
    //   • email известен сайту → запрос-приглашение клиенту (pending_client_approval),
    //     клиент примет его одной кнопкой в своём кабинете;
    //   • иначе → invite_code (code_sent), юрист отправит код вручную.
    const { data: rpcData, error: rpcError } = await supabase.rpc("lawyer_request_client", {
      p_client_name: form.client_name.trim(),
      p_target_email: form.client_email?.trim() || null,
      p_client_phone: form.client_phone?.trim() || null,
    });
    if (rpcError) {
      setSaving(false);
      toast({ title: "Не удалось создать клиента", description: rpcError.message, variant: "destructive" });
      return;
    }
    const rpc = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!rpc?.lawyer_client_id) {
      setSaving(false);
      toast({ title: "Не удалось создать клиента", variant: "destructive" });
      return;
    }

    // Шаг 2. Доп.поля (диагноз/категория/заметки/...) сохраняем UPDATE'ом —
    // RPC принимает только базовые поля, остальное штатным RLS-апдейтом
    // от юриста-владельца.
    const extra = {
      client_birth_year: form.client_birth_year ? parseInt(form.client_birth_year) : null,
      crm_stage: form.crm_stage,
      diagnosis: form.diagnosis || null,
      expected_category: form.expected_category || null,
      notes: form.notes || null,
      priority: form.priority,
      conscription_date: form.conscription_date || null,
    };
    const { data: updated, error: updErr } = await supabase
      .from("lawyer_clients")
      .update(extra)
      .eq("id", rpc.lawyer_client_id)
      .select()
      .single();

    setSaving(false);
    if (updErr) {
      // Карточка создана, но extra-поля не подтянулись — не фатально, юрист
      // дозаполнит в карточке клиента. Просто предупреждаем.
      toast({ title: "Клиент создан, но не все поля сохранились", description: updErr.message });
    }

    const inserted = (updated || { id: rpc.lawyer_client_id }) as LawyerClient & {
      invite_code?: string | null; link_state?: string | null;
    };
    setClients((prev) => [inserted, ...prev]);
    setTotalAll((n) => n + 1);
    setFilteredTotal((n) => n + 1);
    setAddOpen(false);
    const savedName = form.client_name.trim();
    setForm({ client_name: "", client_phone: "", client_email: "", client_birth_year: "",
      crm_stage: "initial_contact", diagnosis: "", expected_category: "", notes: "", priority: "normal",
      conscription_date: "", client_email_link: "" });

    if (rpc.found_account) {
      // Аккаунт клиента найден — запрос отправлен, ждём accept.
      toast({
        title: "Запрос отправлен клиенту",
        description: `${savedName} увидит запрос в своём кабинете на nepriziv.ru и подтвердит его одной кнопкой.`,
      });
    } else {
      // Аккаунта нет — даём юристу код для отправки клиенту вручную.
      setCreatedInvite({
        lawyerClientId: rpc.lawyer_client_id,
        code: rpc.invite_code ?? null,
        clientName: savedName,
      });
    }
  };

  // Бейдж состояния связи. Один helper для списка и канбана — чтобы было
  // легко добавить новые состояния (если в БД появится ещё одно значение
  // link_state, достаточно поправить эту функцию).
  // Возвращает null, если бейдж не нужен (linked_active по умолчанию).
  const renderLinkBadge = (c: LawyerClient, compact = false) => {
    const cls = compact ? "text-[10px] px-1 py-0 gap-0.5" : "text-[10px] gap-1";
    // Fallback на client_user_id, если link_state ещё не заполнен (старые записи)
    const state = c.link_state || (c.client_user_id ? "linked_active" : "code_sent");
    switch (state) {
      case "pending_client_approval":
        return (
          <Badge variant="outline" className={`${cls} border-blue-400 text-blue-700 dark:text-blue-300`}
            title="Запрос отправлен — ждём подтверждения от клиента в его кабинете">
            <Ticket className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {compact ? "Ждём" : "Ожидает подтверждения"}
          </Badge>
        );
      case "code_sent":
        return (
          <Badge variant="outline" className={`${cls} border-amber-400 text-amber-700 dark:text-amber-300 cursor-pointer hover:bg-amber-50`}
            onClick={(e) => { e.stopPropagation(); navigate(`/lawyer/clients/${c.id}`); }}
            title="Клиент ещё не ввёл код приглашения — кликните, чтобы открыть код">
            <Ticket className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {compact ? "Код" : "Код не использован"}
          </Badge>
        );
      case "unlinked":
        return (
          <Badge variant="outline" className={`${cls} border-amber-400 text-amber-700 dark:text-amber-300 cursor-pointer hover:bg-amber-50`}
            onClick={(e) => { e.stopPropagation(); navigate(`/lawyer/clients/${c.id}`); }}
            title="Карточка есть в CRM, но кабинет клиента ещё не привязан. Откройте карточку и отправьте код приглашения.">
            <Ticket className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {compact ? "Без связи" : "Кабинет не привязан"}
          </Badge>
        );
      case "declined":
        return (
          <Badge variant="outline" className={`${cls} border-rose-400 text-rose-700 dark:text-rose-300`}
            title="Клиент отклонил запрос на подключение">
            {compact ? "✕" : "Отклонил запрос"}
          </Badge>
        );
      case "unlinked_by_client":
        return (
          <Badge variant="outline" className={`${cls} text-muted-foreground`}
            title="Клиент сам отвязался — историю дела вы видите, новые документы — нет">
            Клиент ушёл
          </Badge>
        );
      case "unlinked_by_lawyer":
        return (
          <Badge variant="outline" className={`${cls} text-muted-foreground`}
            title="Вы отвязали клиента — можно пригласить снова через новый код">
            Отвязан
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="outline" className={`${cls} text-muted-foreground/60`}
            title="Карточка в архиве — не отображается в активных делах">
            Архив
          </Badge>
        );
      case "linked_active":
      default:
        return null;
    }
  };

  // Дело «горит», если до даты призыва осталось ≤ 14 дней и дело ещё не выиграно.
  // Это главный сортировочный сигнал — юрист должен видеть такие клиенты первыми.
  const isBurning = (c: LawyerClient): boolean => {
    if (c.case_won || !c.conscription_date) return false;
    const days = (new Date(c.conscription_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 14;
  };

  // Серверная выборка уже отфильтрована (этап/приоритет/архив/поиск) — здесь
  // только клиентская сортировка загруженного набора: горящие → срочные →
  // непрочитанные → по дате обновления.
  const filtered = [...clients].sort((a, b) => {
    const ba = isBurning(a), bb = isBurning(b);
    if (ba !== bb) return ba ? -1 : 1;
    const ua = a.priority === "urgent", ub = b.priority === "urgent";
    if (ua !== ub) return ua ? -1 : 1;
    const um_a = (unreadByConv[a.id] || 0) > 0, um_b = (unreadByConv[b.id] || 0) > 0;
    if (um_a !== um_b) return um_a ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });

  const hasMore = (page + 1) * PAGE_SIZE < filteredTotal;

  const loadMoreBtn = hasMore ? (
    <div className="flex justify-center mt-4">
      <Button variant="outline" onClick={() => loadClients(false)} disabled={loadingMore}>
        {loadingMore ? "Загрузка…" : `Загрузить ещё (${clients.length} из ${filteredTotal})`}
      </Button>
    </div>
  ) : null;

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
            <p className="text-muted-foreground text-sm mt-1">{totalAll} клиентов</p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="inline-flex border rounded-md overflow-hidden">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-9"
                onClick={() => changeViewMode("list")}
                title="Список"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-9"
                onClick={() => changeViewMode("kanban")}
                title="Канбан по этапам"
              >
                <KanbanSquare className="h-4 w-4" />
              </Button>
            </div>
            <DiseaseScheduleDrawer>
              <Button variant="outline" size="sm" className="h-9">
                <BookOpen className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Расписание</span>
              </Button>
            </DiseaseScheduleDrawer>
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
                  <div>
                    <Label>Email клиента</Label>
                    <Input
                      type="email"
                      value={form.client_email}
                      onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                      placeholder="client@email.com"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      Если email уже зарегистрирован на nepriziv.ru — клиент увидит ваш запрос
                      в своём кабинете и подтвердит его одной кнопкой. Если email неизвестен или
                      не указан — будет сгенерирован 8-символьный код приглашения для отправки
                      клиенту любым способом.
                    </p>
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
                  <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5 text-primary" /> Что произойдёт после создания
                    </p>
                    <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed list-disc list-inside">
                      <li>
                        <strong>email указан и есть в системе</strong> → клиенту прилетит запрос на
                        подключение. Он принимает его одной кнопкой в кабинете — автоматически
                        открывается доступ к меддокам, ИИ-анализам и чату.
                      </li>
                      <li>
                        <strong>email не указан или не зарегистрирован</strong> → появится
                        8-символьный код приглашения. Отправьте клиенту любым способом — он введёт
                        код в кабинете и привяжется.
                      </li>
                    </ul>
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
            <Input className="pl-9" placeholder="Имя, телефон, email, диагноз, категория..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          {/* Тоггл «Показать архив» — по умолчанию архивные карточки
              (declined / unlinked_* / archived) скрыты, юрист видит активную
              работу. Подсчёт скрытых рядом — чтобы сразу понимать масштаб. */}
          {(archivedCount > 0 || showArchived) && (
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
              className="h-10 gap-2 whitespace-nowrap"
              title="Показывать карточки с отвязкой/отказом/архивом"
            >
              {showArchived ? "Скрыть архив" : "Показать архив"}
              {archivedCount > 0 && !showArchived && (
                <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  {archivedCount}
                </span>
              )}
            </Button>
          )}
        </div>

        {/* Client list / kanban */}
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full mb-2" />)
        ) : loadError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="font-medium">Не удалось загрузить клиентов</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{loadError}</p>
              <Button className="mt-4" variant="outline" onClick={() => loadClients(true)}>
                Повторить
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "list" ? (
          filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {search || stageFilter !== "all" || priorityFilter !== "all"
                  ? "Клиенты не найдены по текущим фильтрам"
                  : totalAll > 0
                    ? "Карточки есть, но сейчас скрыты архивом или фильтрами"
                    : "Нет клиентов. Добавьте первого."}
              </p>
              {totalAll > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setSearch("");
                    setStageFilter("all");
                    setPriorityFilter("all");
                    setShowArchived(true);
                  }}>
                    Показать все карточки
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/lawyer/clients/${c.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{c.client_name}</span>
                          {c.escalation_requested && (
                            <Badge className="text-xs bg-rose-600 text-white border-rose-700">🔴 Просит юриста</Badge>
                          )}
                          {isBurning(c) && (
                            <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300">
                              🔥 Горит
                            </Badge>
                          )}
                          {c.priority === "urgent" && <Badge variant="destructive" className="text-xs">Срочно</Badge>}
                          {c.priority === "high" && <Badge variant="secondary" className="text-xs">Высокий</Badge>}
                          {c.case_won && <Badge className="text-xs bg-green-100 text-green-700">✓ ВБ получен</Badge>}
                          {renderLinkBadge(c)}
                          {c.client_user_id && (
                            docAccessByClient[c.client_user_id] ? (
                              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">
                                <ShieldCheck className="h-3 w-3" />
                                Данные открыты
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                                <ShieldOff className="h-3 w-3" />
                                Нет доступа к досье
                              </Badge>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                          {c.client_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.client_phone}</span>}
                          {c.client_birth_year && <span>{c.client_birth_year} г.р.</span>}
                          {c.conscription_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />до {new Date(c.conscription_date).toLocaleDateString("ru-RU")}</span>}
                          {c.diagnosis && <span className="truncate max-w-[200px]">{c.diagnosis}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CRM_STAGE_BADGE_CLASS[c.crm_stage] || "bg-gray-100 text-gray-700"}`}>
                          {CRM_STAGES.find((s) => s.value === c.crm_stage)?.label || c.crm_stage}
                        </span>
                        <div className="relative">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            title={c.client_user_id ? "Открыть чат" : "Открыть карточку и отправить приглашение"}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(c.client_user_id ? `/lawyer/chat/${c.id}` : `/lawyer/clients/${c.id}`);
                            }}>
                            {c.client_user_id ? (
                              <MessageSquare className={unreadByConv[c.id] ? "h-4 w-4 text-primary" : "h-4 w-4"} />
                            ) : (
                              <Ticket className="h-4 w-4 text-amber-600" />
                            )}
                          </Button>
                          {unreadByConv[c.id] > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 pointer-events-none">
                              {unreadByConv[c.id] > 9 ? "9+" : unreadByConv[c.id]}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {loadMoreBtn}
            </div>
          )
        ) : (
          // Kanban view — серверная выборка уже отфильтрована (архив/приоритет/
          // поиск); фильтр по этапу намеренно не применяется — доска показывает
          // все колонки. Загруженный набор раскладываем по этапам.
          (() => {
            const kanbanClients = clients;
            return (
              <div className="overflow-x-auto -mx-4 px-4 pb-4">
                <div className="inline-flex gap-3 min-w-full items-start">
                  {CRM_STAGES.map((stage) => {
                    const stageClients = kanbanClients.filter((c) => c.crm_stage === stage.value);
                    const isDropTarget = dragOverStage === stage.value;
                    return (
                      <div
                        key={stage.value}
                        onDragOver={(e) => handleStageDragOver(e, stage.value)}
                        onDragLeave={() => setDragOverStage((s) => (s === stage.value ? null : s))}
                        onDrop={(e) => handleStageDrop(e, stage.value)}
                        className={`flex-shrink-0 w-64 rounded-lg border transition-colors ${
                          isDropTarget ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                        }`}
                      >
                        <div className={`px-3 py-2 rounded-t-lg border-b text-xs font-semibold flex items-center justify-between ${CRM_STAGE_BADGE_CLASS[stage.value] || "bg-gray-100 text-gray-700"}`}>
                          <span className="truncate">{stage.label}</span>
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-white/60 text-[10px]">
                            {stageClients.length}
                          </span>
                        </div>
                        <div className="p-2 space-y-2 max-h-[calc(100vh-380px)] min-h-[120px] overflow-y-auto">
                          {stageClients.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground text-center italic py-4">
                              Перетащите сюда
                            </p>
                          ) : (
                            stageClients.map((c) => (
                              <Card
                                key={c.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, c.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => navigate(`/lawyer/clients/${c.id}`)}
                                className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                                  draggedClientId === c.id ? "opacity-40" : ""
                                }`}
                              >
                                <CardContent className="p-3 space-y-1.5">
                                  <div className="flex items-start justify-between gap-1">
                                    <p className="font-medium text-sm leading-tight">{c.client_name}</p>
                                    {unreadByConv[c.id] > 0 && (
                                      <span className="flex-shrink-0 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                                        {unreadByConv[c.id] > 9 ? "9+" : unreadByConv[c.id]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {c.escalation_requested && <Badge className="text-[10px] px-1 py-0 bg-rose-600 text-white border-rose-700">🔴 Юрист</Badge>}
                                    {c.priority === "urgent" && <Badge variant="destructive" className="text-[10px] px-1 py-0">Срочно</Badge>}
                                    {c.priority === "high" && <Badge variant="secondary" className="text-[10px] px-1 py-0">Высокий</Badge>}
                                    {c.case_won && <Badge className="text-[10px] px-1 py-0 bg-green-100 text-green-700">ВБ</Badge>}
                                    {renderLinkBadge(c, true)}
                                    {c.client_user_id && (
                                      <Badge variant="outline" className={`text-[10px] px-1 py-0 gap-0.5 ${
                                        docAccessByClient[c.client_user_id]
                                          ? "border-emerald-400 text-emerald-700 dark:text-emerald-300"
                                          : "text-muted-foreground"
                                      }`}>
                                        {docAccessByClient[c.client_user_id] ? "Доступ" : "Нет досье"}
                                      </Badge>
                                    )}
                                  </div>
                                  {c.client_phone && (
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Phone className="h-3 w-3" />{c.client_phone}
                                    </p>
                                  )}
                                  {c.diagnosis && (
                                    <p className="text-[11px] text-muted-foreground truncate" title={c.diagnosis}>
                                      {c.diagnosis}
                                    </p>
                                  )}
                                  {c.conscription_date && (
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      до {new Date(c.conscription_date).toLocaleDateString("ru-RU")}
                                    </p>
                                  )}
                                  <div className="flex justify-end pt-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      title={c.client_user_id ? "Открыть чат" : "Открыть карточку и отправить приглашение"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(c.client_user_id ? `/lawyer/chat/${c.id}` : `/lawyer/clients/${c.id}`);
                                      }}
                                    >
                                      {c.client_user_id ? (
                                        <MessageSquare className="h-3.5 w-3.5" />
                                      ) : (
                                        <Ticket className="h-3.5 w-3.5 text-amber-600" />
                                      )}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {kanbanClients.length === 0 && (
                  <div className="text-center py-8 mt-4">
                    <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{search || priorityFilter !== "all" ? "Клиенты не найдены" : "Нет клиентов"}</p>
                  </div>
                )}
                {loadMoreBtn}
              </div>
            );
          })()
        )}
      </main>
      <Footer />

      {/* Модалка с invite-кодом — показываем сразу после создания клиента,
          чтобы юрист в один клик отправил код в WhatsApp/Telegram/email. */}
      <Dialog
        open={!!createdInvite}
        onOpenChange={(open) => { if (!open) setCreatedInvite(null); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Клиент добавлен — отправьте ему код</DialogTitle>
          </DialogHeader>
          {createdInvite && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Карточка клиента <strong>{createdInvite.clientName}</strong> создана.
                Отправьте ему код приглашения — после ввода он автоматически привяжется
                и откроет вам доступ к своим медицинским документам.
              </p>
              <InviteCodeCard
                lawyerClientId={createdInvite.lawyerClientId}
                inviteCode={createdInvite.code}
                clientName={createdInvite.clientName}
                onCodeRegenerated={(newCode) =>
                  setCreatedInvite((prev) => (prev ? { ...prev, code: newCode } : prev))
                }
              />
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={() => setCreatedInvite(null)}>
                  Закрыть
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const id = createdInvite.lawyerClientId;
                    setCreatedInvite(null);
                    navigate(`/lawyer/clients/${id}`);
                  }}
                >
                  Открыть карточку
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyerClientsPage;
