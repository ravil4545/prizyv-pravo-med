import { useState, useEffect, useRef, useCallback } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Plus, MessageSquare, Trash2, Menu, UserPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enhanceTypography, linkifyDiseaseArticles } from "@/lib/typography";
import { useDemoMode } from "@/hooks/useDemoMode";
import LimitReachedDialog from "@/components/LimitReachedDialog";
import { buildAIContext } from "@/lib/buildAIContext";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabaseConfig";

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
  const [medicalContext, setMedicalContext] = useState<string>("");
  const [medicalContextLoading, setMedicalContextLoading] = useState(false);
  const medicalContextRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
        title: "Дело передано юристу",
        description: "Юрист увидит ваш запрос и сводку диалога и свяжется с вами в чате.",
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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

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
    const { error } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", id);

    if (!error) {
      const filtered = conversations.filter(c => c.id !== id);
      setConversations(filtered);
      if (currentConversationId === id) {
        setCurrentConversationId(filtered[0]?.id || null);
        setMessages([]);
      }
      toast({
        title: "Диалог удален",
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
    setSending(true);

    try {
      const contextToSend = medicalContextRef.current;
      console.log("[Chat] Sending message with medicalContext:", contextToSend ? contextToSend.length + " chars" : "NONE");

      // Прямой fetch вместо supabase.functions.invoke: invoke в браузере
      // буферизирует ответ и не даёт настоящий SSE-стрим — keepalive-строки
      // вида ": OPENROUTER PROCESSING" приходят как обычный текст и
      // ошибочно показывались как ответ ИИ. fetch с ReadableStream — надёжнее.
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
          // Пример: ": OPENROUTER PROCESSING"
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
        className="w-full mb-4"
        onClick={() => {
          createNewConversation();
          setMobileSidebarOpen(false);
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Новый диалог
      </Button>
      
      <ScrollArea className="h-[calc(100vh-250px)]">
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`p-3 rounded-lg cursor-pointer hover:bg-muted flex items-start justify-between gap-2 ${
                currentConversationId === conv.id ? 'bg-muted' : ''
              }`}
            >
              <div 
                className="flex-1 min-w-0"
                onClick={() => {
                  setCurrentConversationId(conv.id);
                  setMobileSidebarOpen(false);
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{conv.title || "Новый диалог"}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(conv.updated_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col md:flex-row container mx-auto px-2 sm:px-4 py-4 md:py-8 pb-24 md:pb-8 gap-4 overflow-hidden">
        {/* Demo banner */}
        {isDemoMode && (
          <div className="md:hidden mb-2">
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Демо: {remainingDemoAI} из {demoAiLimit} вопросов</span>
                </div>
                <Button size="sm" onClick={() => navigate("/auth")}>Регистрация</Button>
              </CardContent>
            </Card>
          </div>
        )}
        {!isDemoMode && (
          <div className="md:hidden mb-2">
            <SubscriptionBanner compact />
          </div>
        )}
        {/* Desktop Sidebar */}
        {!isMobile && !isDemoMode && (
          <div className="hidden md:block w-64 flex-shrink-0 space-y-4">
            <SubscriptionBanner compact />
            <Card className="h-full">
              <CardContent className="p-4">
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
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2">
            {isMobile && !isDemoMode && (
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                  <SheetHeader className="mb-4">
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
                title="Передать дело и сводку диалога живому юристу"
              >
                {escalating ? (
                  <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                )}
                <span className="hidden sm:inline">
                  {linkedCard?.escalation_requested ? "Юрист уведомлён" : "Передать дело юристу"}
                </span>
                <span className="sm:hidden">
                  {linkedCard?.escalation_requested ? "Передано" : "Юристу"}
                </span>
              </Button>
            )}
          </div>

          <Card className="flex flex-col h-[calc(100vh-240px)] md:h-[calc(100vh-180px)]">
            <CardHeader className="pb-3 sm:pb-4 flex-shrink-0">
              <CardTitle className="text-lg sm:text-xl">AI Юридический консультант</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Консультация по вопросам призыва и воинского учёта
              </p>
              {medicalContextLoading ? (
                <p className="text-xs text-muted-foreground animate-pulse">⏳ Загрузка данных вашего дела...</p>
              ) : medicalContext ? (
                <p className="text-xs text-success">✅ ИИ видит ваш профиль, документы, опросник и события дела</p>
              ) : (
                <p className="text-xs text-muted-foreground">📋 Заполните профиль и загрузите документы — ИИ даст персональную консультацию</p>
              )}
            </CardHeader>
            <CardContent className="flex flex-col flex-1 p-2 sm:p-6 min-h-0 overflow-hidden">
              <ScrollArea className="flex-1 mb-4" ref={scrollAreaRef}>
                <div className="space-y-3 sm:space-y-4 pr-2 sm:pr-4">
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

                    return bubbles.map((bubble, bubbleIdx) => (
                      <div
                        key={`${index}-${bubbleIdx}`}
                        className={`flex ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`sm:max-w-[420px] max-w-[85vw] p-3 sm:p-4 rounded-2xl overflow-hidden ${
                            message.role === "user"
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
                        </div>
                      </div>
                    ));
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

              {/* Быстрые подсказки-продолжения (Модуль 3): после ответа ИИ —
                  кликабельные чипы над полем ввода, отправляются сразу. */}
              {!sending &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {QUICK_REPLIES_FOLLOWUP.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendMessage(q)}
                        className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

              <div className="flex gap-2 items-end">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Введите ваш вопрос..."
                  className="resize-none text-[15px] sm:text-base rounded-xl flex-1"
                  rows={isMobile ? 2 : 3}
                  disabled={sending}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={sending || !input.trim()}
                  size="icon"
                  className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary to-accent shadow-md hover:shadow-lg transition-shadow"
                  aria-label="Отправить"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
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
    </div>
  );
};

export default AIChatDashboardPage;