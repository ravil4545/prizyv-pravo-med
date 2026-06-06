import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Plus, MessageSquare, Trash2, Menu, UserPlus, Loader2, ChevronDown, ChevronUp, Search, Pencil, Check, X, Copy, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enhanceTypography, linkifyDiseaseArticles } from "@/lib/typography";
import { useDemoMode } from "@/hooks/useDemoMode";
import LimitReachedDialog from "@/components/LimitReachedDialog";
import { buildAIContext } from "@/lib/buildAIContext";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabaseConfig";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// Стартовые подсказки (пустой чат) — заполняют поле ввода, можно отредактировать.
const QUICK_REPLIES_START = [
  "Какие диагнозы дают категорию В?",
  "Как обжаловать решение призывной комиссии?",
  "Какие документы нужны для отсрочки по здоровью?",
  "Сроки рассмотрения жалобы в военкомате?",
];

// Подсказки-продолжения (Модуль 3): появляются над полем ввода после ответа ИИ
// и отправляются сразу по клику — проактивно ведут диалог дальше.
const QUICK_REPLIES_FOLLOWUP = [
  "Объясни проще",
  "Что делать дальше по шагам?",
  "Какие документы мне взять с собой?",
  "Сошлись на конкретные статьи закона",
  "Что делать, если повестку бросили в почтовый ящик?",
];

const AIChatDashboardPage = () => {
  const { canAskAI: canAskAISub, incrementAIQuestions: incrementAISub, isActive, remainingAIQuestions } = useSubscription();
  const { isDemoMode, canAskAI: canAskAIDemo, incrementDemoAIQuestions, remainingDemoAI, demoAiLimit } = useDemoMode();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [quickRepliesCollapsed, setQuickRepliesCollapsed] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingSaving, setRenamingSaving] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [showScrollJump, setShowScrollJump] = useState(false);
  const [medicalContext, setMedicalContext] = useState<string>("");
  const [medicalContextLoading, setMedicalContextLoading] = useState(false);
  const medicalContextRef = useRef<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const chatViewportHeight = useVisualViewportHeight(isMobile);
  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === currentConversationId) || null,
    [conversations, currentConversationId],
  );
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title || "Новый диалог"} ${new Date(conversation.updated_at).toLocaleDateString("ru-RU")}`
        .toLowerCase()
        .includes(query),
    );
  }, [conversations, conversationSearch]);

  useEffect(() => {
    setQuickRepliesCollapsed(isMobile);
  }, [currentConversationId, isMobile]);

  // ── Эскалация ИИ → живой юрист ──────────────────────────────────────────
  const [linkedCard, setLinkedCard] = useState<{ id: string; escalation_requested: boolean } | null>(null);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    if (!user || isDemoMode) { setLinkedCard(null); return; }
    let cancelled = false;
    (async () => {
      // Клиент видит свою карточку у юриста (RLS «Client views own lawyer entry»).
      const { data } = await (supabase as any)
        .from("lawyer_clients")
        .select("id, escalation_requested, link_state")
        .eq("client_user_id", user.id)
        .in("link_state", ["linked_active", "pending_client_approval"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setLinkedCard(data ? { id: data.id, escalation_requested: !!data.escalation_requested } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isDemoMode]);

  // ── Проактивный триггер по дедлайну (Модуль 3) ──────────────────────────
  // При открытии чата подтягиваем ближайшее событие дела (≤14 дней). Если есть —
  // показываем подсказку «спросить, как подготовиться», отправляемую одним кликом.
  const [nextDeadline, setNextDeadline] = useState<{ title: string; days: number } | null>(null);

  useEffect(() => {
    if (!user || isDemoMode) { setNextDeadline(null); return; }
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const maxStr = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("case_events")
        .select("title, event_date")
        .eq("user_id", user.id)
        .gte("event_date", todayStr)
        .lte("event_date", maxStr)
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.event_date) {
        const ms = new Date(data.event_date + "T00:00:00Z").getTime() -
          new Date(todayStr + "T00:00:00Z").getTime();
        setNextDeadline({ title: data.title, days: Math.round(ms / 86400000) });
      } else {
        setNextDeadline(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isDemoMode]);

  const deadlineWhen = (days: number) =>
    days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} дн.`;

  const buildEscalationSummary = () => {
    const lines = messages.slice(-12).map((m) =>
      `${m.role === "user" ? "Клиент" : "ИИ"}: ${m.content.replace(/\s+/g, " ").slice(0, 400)}`,
    );
    return (
      "Клиент запросил передачу дела живому юристу из ИИ-чата.\n\nПоследние сообщения диалога:\n" +
      lines.join("\n")
    ).slice(0, 3500);
  };

  const handleEscalate = async () => {
    if (isDemoMode || !user) {
      toast({ title: "Нужен аккаунт", description: "Зарегистрируйтесь, чтобы передать дело юристу." });
      navigate("/auth");
      return;
    }
    if (!linkedCard) {
      toast({
        title: "Сначала выберите юриста",
        description: "Откройте каталог юристов и подключитесь — потом сможете передать дело.",
      });
      navigate("/lawyers");
      return;
    }
    setEscalating(true);
    try {
      const { error } = await (supabase as any).rpc("client_escalate_to_lawyer", {
        p_lawyer_client_id: linkedCard.id,
        p_summary: buildEscalationSummary(),
      });
      if (error) throw error;
      setLinkedCard({ ...linkedCard, escalation_requested: true });
      toast({
        title: "Запрос юристу отправлен",
        description: "Консультация и сопровождение юриста — платная услуга от 9 000 ₽. Юрист свяжется с вами и сориентирует по стоимости.",
      });
    } catch (e: any) {
      toast({
        title: "Не удалось передать",
        description: e?.message || "Попробуйте позже",
        variant: "destructive",
      });
    } finally {
      setEscalating(false);
    }
  };

  const scrollToBottom = useCallback((force = false) => {
    setTimeout(() => {
      if (!force && !shouldAutoScrollRef.current) return;
      messagesEndRef.current?.scrollIntoView({ block: "end" });
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
      shouldAutoScrollRef.current = true;
      setShowScrollJump(false);
    }, 100);
  }, []);

  const handleChatScroll = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceToBottom < 160;
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollJump(!nearBottom);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollJump(false);
    scrollToBottom(true);
  }, [currentConversationId, scrollToBottom]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    viewport.addEventListener("scroll", handleChatScroll, { passive: true });
    handleChatScroll();
    return () => viewport.removeEventListener("scroll", handleChatScroll);
  }, [handleChatScroll, currentConversationId, messages.length]);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
      loadMedicalContext();
    }
  }, [user]);

  const loadMedicalContext = async () => {
    setMedicalContextLoading(true);
    try {
      const ctx = await buildAIContext();
      setMedicalContext(ctx);
      medicalContextRef.current = ctx;
      console.log("[AIContext] Loaded:", ctx.length, "chars");
    } catch (error) {
      console.error("[AIContext] Error building context:", error);
    } finally {
      setMedicalContextLoading(false);
    }
  };

  useEffect(() => {
    if (currentConversationId) {
      loadMessages();
    }
  }, [currentConversationId]);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Allow demo access — don't redirect
        setLoading(false);
        return;
      }

      setUser(session.user);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setConversations(data);
      if (!currentConversationId && data.length > 0) {
        setCurrentConversationId(data[0].id);
      }
    }
  };

  const loadMessages = async () => {
    if (!currentConversationId) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", currentConversationId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      })));
    }
  };

  const createNewConversation = async () => {
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id })
      .select()
      .single();

    if (!error && data) {
      setConversations([data, ...conversations]);
      setCurrentConversationId(data.id);
      setMessages([]);
    }
  };

  const deleteConversation = async (id: string) => {
    setDeletingConversationId(id);
    try {
      const { error } = await supabase
        .from("chat_conversations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      const filtered = conversations.filter(c => c.id !== id);
      setConversations(filtered);
      if (currentConversationId === id) {
        setCurrentConversationId(filtered[0]?.id || null);
        setMessages([]);
      }
      toast({
        title: "Диалог удален",
      });
      setConversationToDelete(null);
    } catch (error: any) {
      toast({
        title: "Не удалось удалить диалог",
        description: error?.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setDeletingConversationId(null);
    }
  };

  const startRenameConversation = (conversation: Conversation) => {
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title || "Новый диалог");
  };

  const cancelRenameConversation = () => {
    setRenamingConversationId(null);
    setRenameDraft("");
  };

  const saveConversationTitle = async () => {
    if (!renamingConversationId) return;
    const title = renameDraft.trim() || "Новый диалог";
    setRenamingSaving(true);
    try {
      const { error } = await supabase
        .from("chat_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", renamingConversationId);

      if (error) throw error;

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === renamingConversationId
            ? { ...conversation, title, updated_at: new Date().toISOString() }
            : conversation,
        ),
      );
      toast({ title: "Диалог переименован" });
      cancelRenameConversation();
    } catch (error: any) {
      toast({
        title: "Не удалось переименовать диалог",
        description: error?.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setRenamingSaving(false);
    }
  };

  const copyMessage = async (content: string, key: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageKey(key);
      toast({ title: "Сообщение скопировано" });
      window.setTimeout(() => setCopiedMessageKey((current) => (current === key ? null : current)), 1600);
    } catch {
      toast({
        title: "Не удалось скопировать",
        description: "Браузер не дал доступ к буферу обмена",
        variant: "destructive",
      });
    }
  };

  const saveMessage = async (message: Message) => {
    if (!currentConversationId) return;

    await supabase
      .from("chat_messages")
      .insert({
        conversation_id: currentConversationId,
        role: message.role,
        content: message.content,
      });

    // Update conversation title from first user message
    if (messages.length === 0 && message.role === "user") {
      const title = message.content.substring(0, 50);
      await supabase
        .from("chat_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", currentConversationId);
      loadConversations();
    } else {
      await supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentConversationId);
    }
  };

  const sendMessage = async (overrideText?: string) => {
    // overrideText — клик по подсказке (Модуль 3): отправляем сразу, не дожидаясь
    // асинхронного setInput. Если не передан — берём из поля ввода.
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || sending) return;

    // Check limits based on mode
    const canAsk = isDemoMode ? canAskAIDemo() : canAskAISub();
    if (!canAsk) {
      setLimitDialogOpen(true);
      return;
    }


    if (!isDemoMode && !currentConversationId) {
      await createNewConversation();
    }

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    if (!isDemoMode) await saveMessage(userMessage);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "44px";
    setSending(true);

    try {
      const contextToSend = medicalContextRef.current;
      console.log("[Chat] Sending message with medicalContext:", contextToSend ? contextToSend.length + " chars" : "NONE");

      // Прямой fetch вместо supabase.functions.invoke: invoke в браузере
      // буферизирует ответ и не даёт настоящий SSE-стрим. fetch с
      // ReadableStream надёжнее для обработки server-sent events.
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || SUPABASE_ANON_KEY;

      console.log("[Chat] POST", `${SUPABASE_URL}/functions/v1/chat`, "auth:", session?.user?.id ? "user" : "anon");

      // Timeout 60 сек на сам запрос. Серверный fallback chain — 3 модели
      // по 15 сек = до 45 сек + накладные расходы. 60 сек оставляет запас.
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn("[Chat] Timeout 60 сек — прерываю запрос");
        abortController.abort();
      }, 60_000);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          ...(contextToSend ? { medicalContext: contextToSend } : {}),
        }),
        signal: abortController.signal,
      });

      console.log("[Chat] response", response.status, "model:", response.headers.get("x-ai-model") || "(нет header)");

      if (!response.ok) {
        // Edge-функция вернула JSON-ошибку (4xx/5xx). Читаем её и показываем.
        let errText = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch {
          // ignore
        }
        throw new Error(errText);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Стрим недоступен");
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      // ВАЖНО: НЕ добавляем placeholder отдельным setMessages — React 18
      // батчит обновления, и первый чанк стрима мог прийти раньше, чем
      // placeholder применится к state. Тогда обновление по индексу
      // newMessages[length-1] писалось в user message → ответ ИИ временно
      // отображался на месте вопроса. Вместо этого добавляем/обновляем
      // assistant-пузырь атомарно по роли.

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(timeoutId);
          break;
        }

        // Буфер для случая, когда SSE-сообщение разрезано между чанками.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Последняя строка может быть неполной — оставляем в буфере до следующего чтения.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // SSE-комментарии (начинаются с ":") — keepalive, игнорируем.
          // Пример: ": keepalive"
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                // Если последний — assistant: апдейтим его. Иначе — добавляем новый.
                // Это безопасно при любом порядке batched-обновлений React.
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { role: "assistant", content: assistantContent };
                } else {
                  next.push({ role: "assistant", content: assistantContent });
                }
                return next;
              });
            }
          } catch {
            // Неполный JSON-чанк — пропускаем
          }
        }
      }

      // Если стрим завершился, но контент пустой — это тихий сбой
      // (rate-limit, сетевая ошибка, обрыв SSE). Подменяем пустой пузырь
      // на явное сообщение об ошибке, чтобы пользователь не видел тишины.
      if (!assistantContent.trim()) {
        const fallback = "⚠ ИИ не ответил. Возможно, превышен лимит запросов к бесплатной модели. Попробуйте через 30–60 секунд или переформулируйте вопрос.";
        setMessages((prev) => {
          const next = [...prev];
          // Заменяем последний (пустой) assistant-пузырь
          if (next.length && next[next.length - 1].role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: fallback };
          } else {
            next.push({ role: "assistant", content: fallback });
          }
          return next;
        });
        toast({
          title: "ИИ не ответил",
          description: "Пустой ответ от модели. Попробуйте ещё раз.",
          variant: "destructive",
        });
        return;
      }

      const assistantMessage: Message = { role: "assistant", content: assistantContent };
      if (!isDemoMode) await saveMessage(assistantMessage);
      if (isDemoMode) {
        incrementDemoAIQuestions();
      } else {
        await incrementAISub();
      }
    } catch (error) {
      console.error("Error sending message:", error);

      const isAbort = error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"));
      const errorTitle = isAbort ? "Таймаут" : "Ошибка";
      const errorBody = isAbort
        ? "ИИ не успел ответить за 45 секунд. Все бесплатные модели могут быть перегружены. Попробуйте через минуту."
        : error instanceof Error
          ? error.message
          : "Не удалось отправить сообщение";

      toast({ title: errorTitle, description: errorBody, variant: "destructive" });

      // Вместо удаления — показываем сообщение об ошибке прямо в чате,
      // чтобы пользователь видел причину, а не пустоту/тишину.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        const errMsg = `⚠ ${errorTitle}: ${errorBody}`;
        if (last && last.role === "assistant") {
          next[next.length - 1] = { role: "assistant", content: errMsg };
        } else {
          next.push({ role: "assistant", content: errMsg });
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12">
          <div className="text-center">Загрузка...</div>
        </main>
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      <Button
        size="sm"
        className="mb-3 w-full flex-shrink-0"
        onClick={() => {
          createNewConversation();
          setMobileSidebarOpen(false);
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Новый диалог
      </Button>
      <div className="relative mb-3 flex-shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={conversationSearch}
          onChange={(event) => setConversationSearch(event.target.value)}
          placeholder="Поиск диалогов"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1 overscroll-contain pr-1">
        <div className="space-y-2 pb-2">
          {filteredConversations.length === 0 && (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {conversationSearch ? "Ничего не найдено" : "Диалогов пока нет"}
            </div>
          )}
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={`group max-w-full overflow-hidden rounded-lg p-3 transition-colors hover:bg-muted ${
                currentConversationId === conv.id ? 'bg-muted' : ''
              }`}
            >
              {renamingConversationId === conv.id ? (
                <div className="space-y-2">
                  <input
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveConversationTitle();
                      if (event.key === "Escape") cancelRenameConversation();
                    }}
                    autoFocus
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <div className="grid min-w-0 grid-cols-[1fr_auto] gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 min-w-0 px-2 hover:scale-100"
                      onClick={saveConversationTitle}
                      disabled={renamingSaving}
                    >
                      {renamingSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                      <span className="min-w-0 truncate">Сохранить</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-9 px-0 hover:scale-100"
                      onClick={cancelRenameConversation}
                      disabled={renamingSaving}
                      aria-label="Отменить переименование"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="w-full min-w-0 overflow-hidden text-left"
                    onClick={() => {
                      setCurrentConversationId(conv.id);
                      setMobileSidebarOpen(false);
                    }}
                  >
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <MessageSquare className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{conv.title || "Новый диалог"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                    </span>
                  </button>
                  <div className="mt-2 grid min-w-0 grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 min-w-0 gap-1 px-1.5 text-[11px] hover:scale-100"
                      onClick={() => startRenameConversation(conv)}
                      title="Переименовать диалог"
                    >
                      <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="min-w-0 truncate">Переименовать</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 min-w-0 gap-1 px-1.5 text-[11px] text-destructive hover:scale-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConversationToDelete(conv)}
                      disabled={deletingConversationId === conv.id}
                      title="Удалить диалог"
                    >
                      {deletingConversationId === conv.id ? (
                        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="min-w-0 truncate">Удалить</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background md:h-full"
      style={isMobile && chatViewportHeight ? { height: chatViewportHeight } : undefined}
    >
      <Header />
      <main className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-0 py-0 md:container md:mx-auto md:flex-row md:gap-4 md:px-4 md:py-4">
        {/* Desktop Sidebar */}
        {!isMobile && !isDemoMode && (
          <div className="hidden min-h-0 w-64 flex-shrink-0 flex-col gap-4 md:flex">
            <SubscriptionBanner compact />
            <Card className="min-h-0 flex-1">
              <CardContent className="flex h-full min-h-0 flex-col p-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </div>
        )}
        {/* Desktop demo banner */}
        {!isMobile && isDemoMode && (
          <div className="hidden md:block w-64 flex-shrink-0">
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">Демо-режим</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Осталось вопросов: {remainingDemoAI} из {demoAiLimit}
                </p>
                <p className="text-xs text-muted-foreground">
                  Зарегистрируйтесь для получения 3 бесплатных вопросов и сохранения истории
                </p>
                <Button size="sm" className="w-full" onClick={() => navigate("/auth")}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Зарегистрироваться
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Chat */}
        <div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur md:mb-4 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-0">
            {isMobile && !isDemoMode && (
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[280px] flex-col sm:w-[320px]">
                  <SheetHeader className="mb-4 flex-shrink-0">
                    <SheetTitle>Диалоги</SheetTitle>
                  </SheetHeader>
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            )}
            <Button 
              variant="ghost" 
              onClick={() => navigate("/dashboard")}
              className="text-xs sm:text-sm"
            >
              <ArrowLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Назад в личный кабинет</span>
              <span className="sm:hidden">Назад</span>
            </Button>
            {!isDemoMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEscalate}
                disabled={escalating || !!linkedCard?.escalation_requested}
                className="ml-auto text-xs sm:text-sm"
                title="Платная услуга: консультация и сопровождение юриста — от 9 000 ₽"
              >
                {escalating ? (
                  <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                )}
                <span className="hidden sm:inline">
                  {linkedCard?.escalation_requested ? "Юрист уведомлён" : "Юрист — от 9 000 ₽"}
                </span>
                <span className="sm:hidden">
                  {linkedCard?.escalation_requested ? "Передано" : "Юрист ₽"}
                </span>
              </Button>
            )}
            {isMobile && isDemoMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/auth")}
                className="ml-auto h-8 flex-shrink-0 gap-1.5 px-2 text-xs"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {remainingDemoAI}/{demoAiLimit}
              </Button>
            )}
            {isMobile && !isDemoMode && currentConversation && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setConversationToDelete(currentConversation)}
                disabled={deletingConversationId === currentConversation.id}
                className="h-9 w-9 flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Удалить текущий диалог"
                title="Удалить текущий диалог"
              >
                {deletingConversationId === currentConversation.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none md:rounded-lg md:border md:shadow-sm">
            <CardHeader className="hidden flex-shrink-0 gap-3 px-3 py-2.5 md:flex md:flex-row md:items-start md:justify-between md:px-6 md:py-4">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl">AI Юридический консультант</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Консультация по вопросам призыва и воинского учёта
                </p>
                {currentConversation && (
                  <p className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                    Текущий диалог: {currentConversation.title || "Новый диалог"}
                  </p>
                )}
                {medicalContextLoading ? (
                  <p className="text-xs text-muted-foreground animate-pulse">⏳ Загрузка данных вашего дела...</p>
                ) : medicalContext ? (
                  <p className="text-xs text-success">✅ ИИ видит ваш профиль, документы, опросник и события дела</p>
                ) : (
                  <p className="text-xs text-muted-foreground">📋 Заполните профиль и загрузите документы — ИИ даст персональную консультацию</p>
                )}
              </div>
              {!isDemoMode && currentConversation && (
                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startRenameConversation(currentConversation)}
                    className="h-9"
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Переименовать
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConversationToDelete(currentConversation)}
                    disabled={deletingConversationId === currentConversation.id}
                    className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deletingConversationId === currentConversation.id ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-4 w-4" />
                    )}
                    Удалить диалог
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-4">
              <ScrollArea className="min-h-0 flex-1 overscroll-contain" ref={scrollAreaRef}>
                <div className="space-y-3 pr-2 pb-3 sm:space-y-4 sm:pr-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center text-center py-6 sm:py-10 px-3 sm:px-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 shadow-md">
                        <MessageSquare className="h-7 w-7 text-white" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-foreground mb-1.5">Спросите ИИ помощника</h3>
                      <p className="text-sm text-muted-foreground max-w-md mb-6">
                        Юридическая и медицинская консультация по призыву. ИИ учитывает ваши документы.
                      </p>
                      {nextDeadline && (
                        <button
                          type="button"
                          onClick={() =>
                            sendMessage(
                              `У меня по делу событие «${nextDeadline.title}» ${deadlineWhen(nextDeadline.days)}. Как к нему подготовиться и какие документы взять?`,
                            )
                          }
                          className="mb-5 flex w-full max-w-2xl items-start gap-3 rounded-xl border border-gold/40 bg-gold/5 p-3 text-left transition-colors hover:bg-gold/10"
                        >
                          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gold/20 text-base">
                            🔔
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">
                              Скоро: {nextDeadline.title} — {deadlineWhen(nextDeadline.days)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Нажмите, чтобы спросить, как подготовиться и что взять с собой
                            </span>
                          </span>
                        </button>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                        {QUICK_REPLIES_START.map((q) => (
                          <button
                            key={q}
                            onClick={() => setInput(q)}
                            className="text-left p-3 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/3 transition-all text-sm text-foreground/80 hover:text-foreground"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((message, index) => {
                    // Split assistant messages by "---" into multiple bubbles (messenger style)
                    const bubbles = message.role === "assistant" && message.content
                      ? message.content.split(/\n\s*---\s*\n/).filter(b => b.trim())
                      : [message.content];

                    return bubbles.map((bubble, bubbleIdx) => {
                      const messageKey = `${index}-${bubbleIdx}`;
                      const isUserMessage = message.role === "user";
                      const copied = copiedMessageKey === messageKey;

                      return (
                        <div
                          key={messageKey}
                          className={`flex ${
                            isUserMessage ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`sm:max-w-[420px] max-w-[85vw] p-3 sm:p-4 rounded-2xl overflow-hidden ${
                              isUserMessage
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted rounded-bl-md"
                            }`}
                            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                          >
                            {message.role === "assistant" ? (
                              <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-[13.5px] sm:text-[14.5px] leading-[1.65] [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_hr]:hidden [&_p]:break-words [&_li]:break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:pl-5 [&_strong]:font-semibold [&_a]:text-gold-deep [&_a]:font-semibold [&_a]:no-underline hover:[&_a]:underline">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ href, children }) => {
                                      // Внутренние ссылки на статьи Расписания болезней — react-router
                                      if (href?.startsWith("/")) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => navigate(href)}
                                            className="text-gold-deep font-semibold hover:underline inline"
                                          >
                                            {children}
                                          </button>
                                        );
                                      }
                                      return (
                                        <a href={href} target="_blank" rel="noopener noreferrer">
                                          {children}
                                        </a>
                                      );
                                    },
                                  }}
                                >
                                  {linkifyDiseaseArticles(enhanceTypography(bubble.trim()))}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-[13.5px] sm:text-[14.5px] leading-[1.65] break-words">{enhanceTypography(bubble)}</p>
                            )}
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => copyMessage(bubble.trim(), messageKey)}
                                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] transition-colors ${
                                  isUserMessage
                                    ? "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                                }`}
                              >
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied ? "Скопировано" : "Копировать"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })}
                  {sending && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                    <div className="flex justify-start">
                      <div className="bg-muted p-3 sm:p-4 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] sm:text-sm text-muted-foreground">ИИ думает</span>
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
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

              {/* Быстрые подсказки-продолжения (Модуль 3): после ответа ИИ —
                  кликабельные чипы над полем ввода, отправляются сразу. */}
              {!sending &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" && (
                  <div className="mb-2 mt-2 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-sm">
                    {quickRepliesCollapsed ? (
                      <button
                        type="button"
                        aria-expanded="false"
                        onClick={() => setQuickRepliesCollapsed(false)}
                        className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                      >
                        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">
                          Подсказки: {QUICK_REPLIES_FOLLOWUP[0]}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {QUICK_REPLIES_FOLLOWUP.length}
                        </span>
                        <ChevronUp className="h-3.5 w-3.5 flex-shrink-0" />
                      </button>
                    ) : (
                      <div className="p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                          <span className="text-xs font-medium text-foreground">Быстрые подсказки</span>
                          <button
                            type="button"
                            aria-label="Свернуть подсказки"
                            onClick={() => setQuickRepliesCollapsed(true)}
                            className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
                          >
                            Свернуть
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                          {QUICK_REPLIES_FOLLOWUP.map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => {
                                setQuickRepliesCollapsed(true);
                                sendMessage(q);
                              }}
                              className="min-h-[36px] flex-none rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              <div className="shrink-0 border-t border-border/60 bg-background/95 pt-2">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.currentTarget.style.height = "auto";
                      e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 132)}px`;
                    }}
                    onFocus={() => scrollToBottom(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Введите ваш вопрос..."
                    enterKeyHint="send"
                    className="min-h-[44px] flex-1 resize-none overflow-hidden rounded-xl text-[15px] leading-relaxed sm:text-base"
                    rows={1}
                    disabled={sending}
                    style={{ maxHeight: 132 }}
                  />
                  <Button
                    onClick={() => sendMessage()}
                    disabled={sending || !input.trim()}
                    size="icon"
                    className="h-11 w-11 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent shadow-md transition-shadow hover:shadow-lg sm:h-12 sm:w-12"
                    aria-label="Отправить"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
      <LimitReachedDialog
        open={limitDialogOpen}
        onClose={() => setLimitDialogOpen(false)}
        type="ai"
        isDemoMode={isDemoMode}
      />
      <AlertDialog
        open={!!conversationToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingConversationId) setConversationToDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить диалог?</AlertDialogTitle>
            <AlertDialogDescription>
              Диалог «{conversationToDelete?.title || "Новый диалог"}» и все сообщения внутри будут удалены без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingConversationId}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (conversationToDelete) deleteConversation(conversationToDelete.id);
              }}
              disabled={!!deletingConversationId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingConversationId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AIChatDashboardPage;
