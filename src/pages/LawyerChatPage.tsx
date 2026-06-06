import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ArrowDown, ArrowLeft, Send, Paperclip, Loader2, Download, Users,
  Search, User, FileText, CheckCheck, Check, Pencil,
  Image as ImageIcon, Sparkles, RefreshCw, CornerDownLeft, ChevronDown, Copy,
  Wand2, AlertTriangle, MoreVertical, UserMinus,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { sanitizeChatMessage, describeDetected } from "@/lib/chatSanitizer";
import { uploadChatAttachment, getSignedChatAttachmentUrl } from "@/lib/storage";
import DiseaseScheduleDrawer from "@/components/DiseaseScheduleDrawer";
import { BookOpen } from "lucide-react";
import { CRM_STAGE_LABELS } from "@/lib/crmStages";
import { useLawyerConversations } from "@/hooks/useLawyerConversations";

interface Message {
  id: string; sender_id: string; content: string | null;
  message_type: string; file_url: string | null; file_name: string | null;
  file_size: number | null; is_read: boolean; created_at: string;
  edited_at?: string | null;
}

interface AISuggestion {
  label: string;
  text: string;
}

interface SuggestionSet {
  id: string;          // client message id that triggered this
  clientMessage: string; // preview of client's question
  summary: string;
  suggestions: AISuggestion[];
  collapsed: boolean;
}

const SUGGEST_URL = "https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/lawyer-chat-suggest";
const SUGGESTION_CACHE_PREFIX = "lawyer-chat-suggestions";
const DATE_EXTRACT_CACHE_PREFIX = "lawyer-chat-date-extract";

interface SuggestionCachePayload {
  set?: SuggestionSet;
  error?: string;
  generatedAt: string;
}

const getSuggestionCacheKey = (clientId: string, messageId: string) =>
  `${SUGGESTION_CACHE_PREFIX}:${clientId}:${messageId}`;

const getDateExtractCacheKey = (clientId: string, messageId: string) =>
  `${DATE_EXTRACT_CACHE_PREFIX}:${clientId}:${messageId}`;

const readSuggestionCache = (clientId: string, messageId: string): SuggestionCachePayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getSuggestionCacheKey(clientId, messageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SuggestionCachePayload;
    if (parsed?.set?.id === messageId || parsed?.error) return parsed;
  } catch {
    return null;
  }
  return null;
};

const writeSuggestionCache = (clientId: string, messageId: string, payload: Omit<SuggestionCachePayload, "generatedAt">) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getSuggestionCacheKey(clientId, messageId),
      JSON.stringify({ ...payload, generatedAt: new Date().toISOString() }),
    );
  } catch {
    // localStorage may be unavailable in private mode; in-memory guards still prevent duplicate calls per session.
  }
};

const LawyerChatPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const chatViewportHeight = useVisualViewportHeight(isMobile);

  const [client, setClient] = useState<Record<string, any> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollJump, setShowScrollJump] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const [sidebarSearch, setSidebarSearch] = useState("");
  // Сайдбар-переключатель использует тот же источник, что и инбокс /lawyer/chats:
  // список диалогов и непрочитанные — из useLawyerConversations + ChatPresenceContext.
  const { conversations: sidebarClients, totalUnread } = useLawyerConversations(sidebarSearch);
  // messageId → подписанная ссылка на вложение (bucket приватный).
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  // AI suggestions
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [mobileAiStripCollapsed, setMobileAiStripCollapsed] = useState(true);
  const [suggestionHistory, setSuggestionHistory] = useState<SuggestionSet[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const autoSuggestRef = useRef<string | null>(null);

  // Draft review (проверка черновика перед отправкой)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<{
    tone?: number; completeness?: number; legal_accuracy?: number; clarity?: number;
    warnings?: string[]; improved?: string; verdict?: string;
  } | null>(null);

  const reviewDraft = async () => {
    if (!text.trim() || !clientId) return;
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Найдём последний вопрос клиента для контекста
      const lastClient = [...messages].reverse().find(
        (m) => m.message_type === "text" && m.sender_id !== user!.id && m.content?.trim(),
      );
      const res = await supabase.functions.invoke("lawyer-draft-review", {
        body: {
          lawyerClientId: clientId,
          draft: text,
          lastClientMessage: lastClient?.content || null,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      setReviewResult(res.data);
    } catch (e) {
      toast({ title: "Ошибка проверки", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setReviewOpen(false);
    }
    setReviewLoading(false);
  };

  const applyImprovedDraft = () => {
    if (reviewResult?.improved) {
      setText(reviewResult.improved);
      setReviewOpen(false);
      toast({ title: "Черновик заменён" });
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((force = false) => {
    setTimeout(() => {
      if (!force && !shouldAutoScrollRef.current) return;
      bottomRef.current?.scrollIntoView({ block: "end" });
      if (messagesScrollRef.current) {
        messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
      }
      shouldAutoScrollRef.current = true;
      setShowScrollJump(false);
    }, 80);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const viewport = messagesScrollRef.current;
    if (!viewport) return;
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceToBottom < 160;
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollJump(!nearBottom);
  }, []);

  // «Убрать из моих клиентов» прямо из чата (soft-archive карточки).
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const removeClient = async () => {
    if (!clientId) return;
    setRemoving(true);
    const { error } = await supabase.rpc("lawyer_delete_client", { p_lawyer_client_id: clientId });
    setRemoving(false);
    if (error) {
      toast({ title: "Не удалось убрать клиента", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Клиент убран из CRM", description: "История дела сохранена в архиве." });
    navigate("/lawyer/clients", { replace: true });
  };

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    initChat();
  }, [user, profileLoading, isLawyer, clientId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollJump(false);
    scrollToBottom(true);
  }, [clientId, scrollToBottom]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (!user || !clientId || !isLawyer) return;
    const channel = supabase
      .channel(`lawyer-chat:${clientId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "lawyer_chat_messages",
        filter: `lawyer_client_id=eq.${clientId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        resolveAttachments([msg]);
        if (msg.sender_id !== user!.id) {
          // Помечаем входящее прочитанным — ChatPresenceContext подхватит UPDATE
          // и пересчитает непрочитанные (в т.ч. бейдж сайдбара).
          supabase.from("lawyer_chat_messages").update({ is_read: true }).eq("id", msg.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "lawyer_chat_messages",
        filter: `lawyer_client_id=eq.${clientId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, clientId, isLawyer]);

  // Reset suggestion history when switching clients
  useEffect(() => {
    setSuggestionHistory([]);
    setSuggestionsError(null);
    autoSuggestRef.current = null;
    extractedDateRef.current = null;
    setMobileAiStripCollapsed(true);
  }, [clientId]);

  useEffect(() => {
    setMobileAiStripCollapsed(true);
  }, [suggestionHistory.length]);

  // Auto-trigger AI suggestions when last text message is from client
  useEffect(() => {
    if (!messages.length || !user || !clientId) return;
    const lastText = [...messages].reverse().find(m => m.message_type === "text");
    if (!lastText || lastText.sender_id === user.id) return;
    const cacheKey = getSuggestionCacheKey(clientId, lastText.id);
    if (autoSuggestRef.current === cacheKey) return;
    const cached = readSuggestionCache(clientId, lastText.id);
    if (cached?.set) {
      autoSuggestRef.current = cacheKey;
      setSuggestionsError(null);
      upsertSuggestionSet(cached.set);
    } else if (cached?.error) {
      autoSuggestRef.current = cacheKey;
      setSuggestionsError(cached.error);
    } else {
      autoSuggestRef.current = cacheKey;
      loadSuggestionsFor(messages);
    }
    // Параллельно — лёгкий парсер даты призыва. Если клиент упомянул дату повестки,
    // юристу появится тост с предложением одним кликом заполнить conscription_date.
    tryExtractDate(lastText.content || "", lastText.id);
  }, [messages, user?.id, clientId]);

  const extractedDateRef = useRef<string | null>(null);

  const tryExtractDate = async (text: string, msgId: string) => {
    if (!clientId) return;
    const cacheKey = getDateExtractCacheKey(clientId, msgId);
    if (extractedDateRef.current === cacheKey) return;
    if (typeof window !== "undefined" && window.localStorage.getItem(cacheKey)) return;
    extractedDateRef.current = cacheKey;
    if (text.length < 8 || !/(\d{1,2}|январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр|призыв|повестк)/i.test(text)) {
      return; // быстрый локальный фильтр чтобы не дёргать ИИ зря
    }
    try {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(cacheKey, new Date().toISOString());
        } catch {
          // Ignore storage failures; the ref still prevents duplicates during this session.
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-extract-date", {
        body: { text },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) return;
      const result = res.data as {
        found: boolean; date_iso: string | null; original_phrase: string | null; confidence: number;
      };
      if (!result.found || !result.date_iso || result.confidence < 70) return;

      // Если у клиента уже есть та же дата — не предлагаем повторно
      if (client?.conscription_date === result.date_iso) return;

      toast({
        title: "Кажется, клиент назвал дату призыва",
        description: `«${result.original_phrase || text.slice(0, 60)}» → ${new Date(result.date_iso).toLocaleDateString("ru-RU")}. Сохранить?`,
        action: (
          <Button
            size="sm"
            onClick={async () => {
              await supabase.from("lawyer_clients")
                .update({ conscription_date: result.date_iso })
                .eq("id", clientId);
              setClient((prev: any) => ({ ...prev, conscription_date: result.date_iso }));
              toast({ title: "Дата призыва сохранена" });
            }}
          >
            Сохранить
          </Button>
        ) as any,
      });
    } catch { /* тихий фейл */ }
  };

  // Подписываем ссылки на вложения (bucket приватный) — по одной на сообщение.
  const resolveAttachments = async (msgs: Message[]) => {
    const targets = msgs.filter((m) => m.file_url && (m.message_type === "image" || m.message_type === "file"));
    if (targets.length === 0) return;
    const entries = await Promise.all(
      targets.map(async (m) => [m.id, await getSignedChatAttachmentUrl(m.file_url!)] as const),
    );
    setAttachmentUrls((prev) => {
      const next = { ...prev };
      for (const [id, url] of entries) if (url) next[id] = url;
      return next;
    });
  };

  const initChat = async () => {
    setLoading(true);
    const { data: c } = await supabase
      .from("lawyer_clients").select("*").eq("id", clientId).eq("lawyer_id", user!.id).single();
    if (!c) { navigate("/lawyer/clients"); return; }
    setClient(c);

    const { data: msgs } = await supabase
      .from("lawyer_chat_messages").select("*")
      .eq("lawyer_client_id", clientId).order("created_at", { ascending: true });
    const list = (msgs as Message[]) || [];
    setMessages(list);
    resolveAttachments(list);
    setLoading(false);

    await supabase.from("lawyer_chat_messages")
      .update({ is_read: true }).eq("lawyer_client_id", clientId).neq("sender_id", user!.id);
    // Бейдж непрочитанных обновит ChatPresenceContext (он слушает UPDATE is_read).
  };

  const upsertSuggestionSet = (newSet: SuggestionSet) => {
    setSuggestionHistory(prev => [
      ...prev.filter(s => s.id !== newSet.id).map(s => ({ ...s, collapsed: true })),
      { ...newSet, collapsed: false },
    ]);
  };

  const loadSuggestionsFor = async (currentMessages: Message[], options: { force?: boolean } = {}) => {
    if (!clientId || !user || currentMessages.length === 0) return;

    // Find last client text message — this is what we'll answer
    const lastClientMsg = [...currentMessages].reverse().find(
      m => m.message_type === "text" && m.sender_id !== user.id && m.content?.trim()
    );
    if (!lastClientMsg?.content) return;

    const cacheKey = getSuggestionCacheKey(clientId, lastClientMsg.id);
    if (!options.force) {
      const cached = readSuggestionCache(clientId, lastClientMsg.id);
      if (cached?.set) {
        autoSuggestRef.current = cacheKey;
        setSuggestionsError(null);
        upsertSuggestionSet(cached.set);
        return;
      }
      if (cached?.error) {
        autoSuggestRef.current = cacheKey;
        setSuggestionsError(cached.error);
        return;
      }
    }

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(SUGGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lawyerClientId: clientId,
          messages: currentMessages.map(m => ({
            sender_id: m.sender_id,
            content: m.content,
            message_type: m.message_type,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }
      const data = await res.json();

      const newSet: SuggestionSet = {
        id: lastClientMsg.id,
        clientMessage: lastClientMsg.content!,
        summary: data.summary || "",
        suggestions: data.suggestions || [],
        collapsed: false,
      };
      upsertSuggestionSet(newSet);
      autoSuggestRef.current = cacheKey;
      writeSuggestionCache(clientId, lastClientMsg.id, { set: newSet });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка ИИ";
      setSuggestionsError(message);
      writeSuggestionCache(clientId, lastClientMsg.id, { error: message });
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const toggleCollapsed = (id: string) => {
    setSuggestionHistory(prev =>
      prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s)
    );
  };

  const insertSuggestion = (suggText: string) => {
    setText(suggText);
    setAiPanelOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const copyMessage = async (content: string, messageId: string) => {
    const value = content.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMessageId(messageId);
      toast({ title: "Сообщение скопировано" });
      window.setTimeout(() => setCopiedMessageId((current) => (current === messageId ? null : current)), 1600);
    } catch {
      toast({
        title: "Не удалось скопировать",
        description: "Браузер не дал доступ к буферу обмена",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async (content: string, type = "text", fileUrl?: string, fileName?: string, fileSize?: number) => {
    setSending(true);

    // Защита: блокируем обмен внешними контактами в чате до подписания договора
    let safeContent = content;
    if (content && type === "text") {
      const check = sanitizeChatMessage(content);
      if (check.hasReplacements) {
        safeContent = check.sanitized;
        toast({
          title: "Контакты скрыты",
          description: `Мы скрыли ${describeDetected(check.detected)} в вашем сообщении. До договора общение только в чате сайта.`,
        });
      }
    }

    const { data, error } = await supabase.from("lawyer_chat_messages").insert({
      lawyer_client_id: clientId, sender_id: user!.id,
      content: safeContent || null, message_type: type,
      file_url: fileUrl || null, file_name: fileName || null, file_size: fileSize || null,
    }).select().single();
    if (error) {
      toast({ title: "Ошибка отправки", description: error.message, variant: "destructive" });
    } else if (data) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === (data as Message).id)) return prev;
        return [...prev, data as Message];
      });
      resolveAttachments([data as Message]);
    }
    setSending(false);
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim(); setText("");
    if (textareaRef.current) { textareaRef.current.style.height = "40px"; }
    await sendMessage(t);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Файл больше 10 МБ", variant: "destructive" }); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `chat/${clientId}/${Date.now()}.${ext}`;
    try {
      // Храним storage-путь (bucket приватный); ссылку подписываем при показе.
      const storedPath = await uploadChatAttachment(path, file, file.type);
      await sendMessage(file.name, file.type.startsWith("image/") ? "image" : "file", storedPath, file.name, file.size);
    } catch (err: any) {
      toast({ title: "Ошибка загрузки", description: err?.message, variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingId) return;
    const { error } = await supabase.from("lawyer_chat_messages")
      .update({ content: editText.trim(), edited_at: new Date().toISOString() })
      .eq("id", editingId).eq("sender_id", user!.id);
    if (error) { toast({ title: "Ошибка редактирования", variant: "destructive" }); return; }
    setMessages((prev) => prev.map((m) =>
      m.id === editingId ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m
    ));
    setEditingId(null);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const grouped: { date: string; msgs: Message[] }[] = [];
  messages.forEach((m) => {
    const d = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) grouped.push({ date: d, msgs: [m] });
    else last.msgs.push(m);
  });


  const historyItems = suggestionHistory.slice(0, -1);
  const currentItem = suggestionHistory.length > 0
    ? suggestionHistory[suggestionHistory.length - 1]
    : null;
  const showMobileAiStrip = suggestionsLoading || !!suggestionsError || !!currentItem;
  const firstMobileSuggestion = currentItem?.suggestions[0] || null;

  // AI panel content as JSX variable (avoids component-inside-render issues)
  const aiPanelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-semibold text-sm">ИИ-помощник</span>
        </div>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => loadSuggestionsFor(messages, { force: true })}
          disabled={suggestionsLoading}
          title="Перегенерировать рекомендации"
        >
          {suggestionsLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── History strips — collapse/expand previous questions ── */}
        {historyItems.map((set) => (
          <div key={set.id} className="border-b">
            {/* Collapsed strip — always visible */}
            <button
              onClick={() => toggleCollapsed(set.id)}
              className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors text-left"
            >
              <Sparkles className="h-3 w-3 text-primary/40 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate flex-1 leading-snug">
                {set.clientMessage.length > 58
                  ? set.clientMessage.slice(0, 58) + "…"
                  : set.clientMessage}
              </span>
              <ChevronDown className={cn(
                "h-3 w-3 text-muted-foreground/50 flex-shrink-0 transition-transform duration-200",
                !set.collapsed && "rotate-180"
              )} />
            </button>
            {/* Expanded content — slides down */}
            {!set.collapsed && (
              <div className="border-t bg-muted/10 px-3 pb-3 pt-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                {set.summary && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                    {set.summary}
                  </p>
                )}
                {set.suggestions.map((s, i) => (
                  <div key={i} className="border rounded-xl p-2.5 space-y-1.5 bg-card">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-primary">{s.label}</span>
                      <Button
                        variant="outline" size="sm"
                        className="h-5 text-[9px] px-1.5 gap-0.5 flex-shrink-0"
                        onClick={() => insertSuggestion(s.text)}
                      >
                        <CornerDownLeft className="h-2.5 w-2.5" />
                        Вставить
                      </Button>
                    </div>
                    <p className="text-[11px] text-foreground/80 leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* ── Current / latest suggestions ── */}
        <div className="p-3 space-y-3">
          {/* Error */}
          {suggestionsError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {suggestionsError}
            </p>
          )}

          {/* Loading skeleton */}
          {suggestionsLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-xl p-3 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!suggestionsLoading && !currentItem && !suggestionsError && (
            <div className="text-center py-10 space-y-3 text-muted-foreground">
              <Sparkles className="h-9 w-9 mx-auto opacity-20" />
              <p className="text-xs px-2">ИИ сформирует рекомендации один раз, когда клиент напишет сообщение. Повторный запуск — кнопкой сверху.</p>
            </div>
          )}

          {/* Current suggestions — тонкий градиент даёт визуальный сигнал «это магия ИИ», а не обычный текст */}
          {!suggestionsLoading && currentItem && (
            <>
              {currentItem.summary && (
                <p className="text-[11px] text-muted-foreground bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 rounded-lg px-3 py-2 leading-relaxed border border-violet-200/40 dark:border-violet-900/30">
                  {currentItem.summary}
                </p>
              )}
              {currentItem.suggestions.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 space-y-2 bg-gradient-to-br from-violet-50/70 to-blue-50/70 dark:from-violet-950/20 dark:to-blue-950/20 border border-violet-200/50 dark:border-violet-900/30 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                      {s.label}
                    </span>
                    <Button
                      variant="outline" size="sm"
                      className="h-6 text-[10px] px-2 gap-1 flex-shrink-0 bg-background/80"
                      onClick={() => insertSuggestion(s.text)}
                    >
                      <CornerDownLeft className="h-3 w-3" />
                      Вставить
                    </Button>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (loading || profileLoading) return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden bg-background"
      style={isMobile && chatViewportHeight ? { height: chatViewportHeight } : undefined}
    >
      <Header />
      <div className="flex-1 container mx-auto px-4 py-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-3/4" style={{ marginLeft: i % 2 ? "auto" : 0 }} />
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden bg-background"
      style={isMobile && chatViewportHeight ? { height: chatViewportHeight } : undefined}
    >
      <Header />

      <div className="flex-1 min-h-0 p-0 lg:p-3">
        <div className="h-full flex overflow-hidden lg:rounded-xl lg:border lg:shadow-md bg-background lg:bg-card/50">

          {/* ── Clients sidebar ─────────────────────────────────────────────── */}
          <aside className="hidden min-w-0 overflow-hidden lg:flex flex-col w-64 xl:w-72 border-r bg-card/30 flex-shrink-0">
            <div className="px-3 py-3 border-b flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
                onClick={() => navigate("/lawyer/clients")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm truncate">Клиенты</span>
                {totalUnread > 0 && (
                  <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-red-500 text-white">{totalUnread}</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs flex-shrink-0" asChild>
                <Link to="/lawyer/clients">Все</Link>
              </Button>
            </div>
            <div className="px-3 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Поиск..." value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)} className="h-8 text-sm pl-8" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-0.5">
              {sidebarClients.map((c) => (
                <button key={c.id} onClick={() => navigate(`/lawyer/chat/${c.id}`)}
                  className={cn(
                    "w-full min-w-0 text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-muted group",
                    clientId === c.id ? "bg-primary/10 border border-primary/20" : ""
                  )}>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className={cn("font-medium text-sm truncate", clientId === c.id ? "text-primary" : "")}>
                      {c.client_name}
                    </p>
                    {c.unread > 0 && (
                      <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {CRM_STAGE_LABELS[c.crm_stage] || c.crm_stage}
                  </p>
                </button>
              ))}
              {sidebarClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Клиентов нет</p>
              )}
            </div>
          </aside>

          {/* ── Chat area ────────────────────────────────────────────────────── */}
          <div className="relative flex-1 min-w-0 flex flex-col">
            {/* Top bar */}
            <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur">
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden flex-shrink-0"
                onClick={() => navigate("/lawyer/clients")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{client?.client_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {CRM_STAGE_LABELS[client?.crm_stage] || ""}
                  {client?.client_phone ? ` · ${client.client_phone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <DiseaseScheduleDrawer>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 hidden sm:flex">
                    <BookOpen className="h-3.5 w-3.5" />Расписание
                  </Button>
                </DiseaseScheduleDrawer>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 hidden sm:flex" asChild>
                  <Link to={`/lawyer/clients/${clientId}`}>
                    <User className="h-3.5 w-3.5" />Дело
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 hidden sm:flex" asChild>
                  <Link to={`/lawyer/clients/${clientId}`}>
                    <FileText className="h-3.5 w-3.5" />Документы
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" asChild>
                  <Link to={`/lawyer/clients/${clientId}`}><User className="h-4 w-4" /></Link>
                </Button>
                {/* Открыть AI-панель на узких экранах (где постоянная панель скрыта) */}
                <Button
                  variant={suggestionHistory.length > 0 ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs gap-1.5 md:hidden flex-shrink-0 relative"
                  onClick={() => setAiPanelOpen(true)}
                  title="ИИ-помощник: подсказки ответа клиенту"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  ИИ
                  {suggestionHistory.length > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground text-primary text-[10px] px-1">
                      {suggestionHistory.length}
                    </span>
                  )}
                </Button>
                {/* Меню действий по клиенту — «убрать из моих клиентов» */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Действия по клиенту">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => navigate(`/lawyer/clients/${clientId}`)}>
                      <User className="h-4 w-4 mr-2" /> Открыть карточку
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setRemoveOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <UserMinus className="h-4 w-4 mr-2" /> Убрать из моих клиентов
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto max-w-3xl space-y-0.5 px-3 py-3 pb-4">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">Нет сообщений.</div>
                )}
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
                    <div className="flex justify-center my-3">
                      <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">{date}</span>
                    </div>
                    {msgs.map((m) => {
                      const isOwn = m.sender_id === user!.id;
                      const fileSrc = attachmentUrls[m.id];
                      if (m.message_type === "system") {
                        return (
                          <div key={m.id} className="flex justify-center my-2">
                            <span className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-3 py-1 max-w-[85%] text-center">
                              {m.content}
                            </span>
                          </div>
                        );
                      }
                      const copyContent = m.message_type === "text" ? m.content : (m.file_name || m.content);
                      const copied = copiedMessageId === m.id;
                      return (
                        <div key={m.id} className={cn("flex mb-1 items-end gap-1 group", isOwn ? "flex-row-reverse" : "")}>
                          {copyContent && (
                            <div className="mb-1 flex flex-col gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                              {isOwn && m.message_type === "text" && editingId !== m.id && (
                                <Button variant="ghost" size="icon"
                                  className="h-6 w-6 flex-shrink-0"
                                  onClick={() => { setEditingId(m.id); setEditText(m.content || ""); }}
                                  title="Редактировать">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => copyMessage(copyContent, m.id)}
                                title={copied ? "Скопировано" : "Копировать"}
                              >
                                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[86%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[78%] break-words",
                            isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"
                          )}>
                            {editingId === m.id ? (
                              <div>
                                <textarea
                                  ref={editRef}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  className="w-full text-sm bg-primary-foreground/10 text-primary-foreground rounded-lg px-2 py-1 resize-none border border-primary-foreground/20 focus:outline-none min-w-[180px]"
                                  rows={2}
                                />
                                <div className="flex gap-1 mt-1.5 justify-end">
                                  <button onClick={() => setEditingId(null)}
                                    className="text-[10px] text-primary-foreground/70 hover:text-primary-foreground px-2 py-0.5 rounded">
                                    Отмена
                                  </button>
                                  <button onClick={saveEdit}
                                    className="text-[10px] bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground px-2 py-0.5 rounded">
                                    Сохранить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {m.message_type === "image" && m.file_url && (
                                  <div className="mb-1.5">
                                    {fileSrc ? (
                                      <img src={fileSrc} alt={m.file_name || "Фото"}
                                        className="max-w-full rounded-lg max-h-52 object-cover cursor-pointer"
                                        onClick={() => window.open(fileSrc, "_blank")} />
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs opacity-70 py-4">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка фото…
                                      </div>
                                    )}
                                  </div>
                                )}
                                {m.message_type === "file" && m.file_url && (
                                  fileSrc ? (
                                    <a href={fileSrc} target="_blank" rel="noopener noreferrer"
                                      className={cn("flex items-center gap-2 text-sm hover:underline",
                                        isOwn ? "text-primary-foreground" : "text-primary")}>
                                      <Download className="h-4 w-4 flex-shrink-0" />
                                      <span className="truncate">{m.file_name || "Файл"}</span>
                                      {m.file_size && <span className="text-xs opacity-70">({Math.round(m.file_size / 1024)} КБ)</span>}
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm opacity-70">
                                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                      <span className="truncate">{m.file_name || "Файл"}</span>
                                    </div>
                                  )
                                )}
                                {m.message_type === "text" && m.content && (
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                )}
                                {m.message_type !== "text" && m.content && m.content !== m.file_name && (
                                  <p className="text-sm mt-1">{m.content}</p>
                                )}
                              </>
                            )}
                            <div className={cn("flex items-center justify-end gap-1 mt-0.5",
                              isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
                              {m.edited_at && <span className="text-[10px] opacity-60">изм.</span>}
                              <span className="text-[11px]">{formatTime(m.created_at)}</span>
                              {isOwn && (m.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
            {showScrollJump && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-10 flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => scrollToBottom(true)}
                  className="pointer-events-auto h-9 rounded-full border border-border/70 bg-background/95 px-3 shadow-md backdrop-blur"
                >
                  <ArrowDown className="mr-1.5 h-4 w-4" />
                  Вниз
                </Button>
              </div>
            )}

            {showMobileAiStrip && (
              <div className="border-t bg-card/95 px-3 py-2 md:hidden">
                <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-primary/20 bg-background/95 shadow-sm">
                  {mobileAiStripCollapsed ? (
                    <button
                      type="button"
                      aria-expanded="false"
                      onClick={() => setMobileAiStripCollapsed(false)}
                      className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">
                        {suggestionsLoading
                          ? "ИИ готовит подсказки ответа"
                          : firstMobileSuggestion
                            ? `Подсказка: ${firstMobileSuggestion.label}`
                            : suggestionsError || "ИИ-подсказки"}
                      </span>
                      {currentItem?.suggestions.length ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {currentItem.suggestions.length}
                        </span>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                    </button>
                  ) : (
                    <div className="p-2">
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <span className="text-xs font-medium">ИИ-подсказки к ответу</span>
                        <button
                          type="button"
                          onClick={() => setMobileAiStripCollapsed(true)}
                          className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
                        >
                          Свернуть
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {suggestionsLoading && (
                        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ИИ анализирует последнее сообщение клиента
                        </div>
                      )}
                      {suggestionsError && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{suggestionsError}</p>
                      )}
                      {!suggestionsLoading && currentItem && (
                        <div className="space-y-2">
                          {currentItem.suggestions.slice(0, 2).map((s, i) => (
                            <div key={`${s.label}-${i}`} className="rounded-lg border bg-card p-2">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-primary">{s.label}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 flex-shrink-0 gap-1 px-2 text-xs"
                                  onClick={() => {
                                    insertSuggestion(s.text);
                                    setMobileAiStripCollapsed(true);
                                  }}
                                >
                                  <CornerDownLeft className="h-3 w-3" />
                                  Вставить
                                </Button>
                              </div>
                              <p className="max-h-16 overflow-hidden text-xs leading-relaxed text-foreground/75">{s.text}</p>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full text-xs"
                            onClick={() => setAiPanelOpen(true)}
                          >
                            Открыть все подсказки
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Input bar */}
            <div className="flex-shrink-0 border-t bg-card/95 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur sm:pb-2.5">
              <div className="mx-auto flex max-w-3xl items-end gap-1.5">
                <input type="file" ref={imageRef} onChange={handleFile} className="hidden" accept="image/*" />
                <input type="file" ref={fileRef} onChange={handleFile} className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11 flex-shrink-0 sm:hidden"
                      disabled={uploading} title="Прикрепить">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-44">
                    <DropdownMenuItem onClick={() => imageRef.current?.click()}>
                      <ImageIcon className="mr-2 h-4 w-4" /> Фото
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                      <Paperclip className="mr-2 h-4 w-4" /> Файл
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="hidden h-9 w-9 flex-shrink-0 sm:inline-flex"
                  onClick={() => imageRef.current?.click()} disabled={uploading} title="Отправить фото">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="hidden h-9 w-9 flex-shrink-0 sm:inline-flex"
                  onClick={() => fileRef.current?.click()} disabled={uploading} title="Прикрепить файл">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                  onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80)}
                  onKeyDown={handleKeyDown}
                  placeholder="Написать сообщение..."
                  enterKeyHint="send"
                  rows={1}
                  disabled={sending}
                  className="min-h-[44px] flex-1 resize-none overflow-hidden rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 sm:min-h-[40px] sm:py-2 sm:text-sm"
                  style={{ maxHeight: "120px" }}
                />
                {/* ИИ-проверка черновика перед отправкой — страхует от ошибок в формулировках */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={reviewDraft}
                  disabled={!text.trim() || sending || reviewLoading}
                  className="h-11 w-11 flex-shrink-0 sm:h-9 sm:w-9"
                  title="ИИ-проверка черновика"
                >
                  {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-primary" />}
                </Button>
                <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}
                  className="h-11 w-11 flex-shrink-0 rounded-xl sm:h-9 sm:w-9">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* ── AI Panel — постоянно справа на экранах ≥ md ─────────────────── */}
          <aside className="hidden md:flex flex-col w-60 lg:w-64 xl:w-72 border-l bg-card/30 flex-shrink-0">
            {aiPanelContent}
          </aside>
        </div>
      </div>

      {/* ── AI Panel — mobile Sheet from right ───────────────────────────────── */}
      <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px] p-0 flex flex-col">
          {aiPanelContent}
        </SheetContent>
      </Sheet>

      {/* ── Подтверждение «Убрать из моих клиентов» ──────────────────────────── */}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Убрать клиента из CRM?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Карточка {client?.client_name ? <strong>«{client.client_name}»</strong> : "клиента"} уйдёт
                  в архив. Вы потеряете доступ к его документам и ИИ-анализам.
                </p>
                <p className="text-xs text-muted-foreground">
                  История чата и заметки сохранятся в архиве. Документы клиента в его
                  собственном кабинете не пострадают.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); removeClient(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserMinus className="h-4 w-4 mr-2" />}
              Убрать из клиентов
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── ИИ-проверка черновика ─────────────────────────────────────────── */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Проверка черновика
            </DialogTitle>
          </DialogHeader>
          {reviewLoading && (
            <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">ИИ читает ваш черновик и проверяет его на корректность...</p>
            </div>
          )}
          {!reviewLoading && reviewResult && (
            <div className="space-y-4">
              {reviewResult.verdict && (
                <p className="text-sm bg-muted/40 rounded-lg px-3 py-2">{reviewResult.verdict}</p>
              )}
              {/* Оценки */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Тон", value: reviewResult.tone },
                  { label: "Полнота", value: reviewResult.completeness },
                  { label: "Юр. точность", value: reviewResult.legal_accuracy },
                  { label: "Понятность", value: reviewResult.clarity },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className={cn(
                      "text-lg font-bold",
                      (value || 0) >= 4 ? "text-emerald-600" : (value || 0) >= 3 ? "text-amber-600" : "text-red-600",
                    )}>
                      {value ?? "—"}<span className="text-xs text-muted-foreground">/5</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Предупреждения */}
              {reviewResult.warnings && reviewResult.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1 mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> На что обратить внимание
                  </p>
                  <ul className="text-sm space-y-0.5 list-disc list-inside">
                    {reviewResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Улучшенная версия */}
              {reviewResult.improved && (
                <div>
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Предлагаемая версия
                  </p>
                  <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                    {reviewResult.improved}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)} className="w-full sm:w-auto">
              Закрыть
            </Button>
            {reviewResult?.improved && (
              <Button onClick={applyImprovedDraft} className="w-full sm:w-auto">
                <Wand2 className="h-4 w-4 mr-1.5" /> Подставить улучшенную
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyerChatPage;
