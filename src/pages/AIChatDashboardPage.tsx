import { useState, useEffect, useRef, useCallback } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMonths } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Plus, MessageSquare, Trash2, Menu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enhanceTypography } from "@/lib/typography";

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

const AIChatDashboardPage = () => {
  const { canAskAI, incrementAIQuestions, isActive, remainingAIQuestions } = useSubscription();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [medicalContext, setMedicalContext] = useState<string>("");
  const [medicalContextLoading, setMedicalContextLoading] = useState(false);
  const medicalContextRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
      console.log("[MedicalContext] Loading medical data...");
      // Load documents, article links, and article names in parallel
      const [docsRes, linksRes, articlesRes] = await Promise.all([
        supabase
          .from("medical_documents_v2")
          .select("id, title, document_date, document_type_id, document_subtype_id, document_types(name), document_subtypes(name)")
          .order("document_date", { ascending: false }),
        supabase
          .from("document_article_links")
          .select("document_id, article_id, ai_category_chance, ai_fitness_category, ai_explanation, ai_recommendations, disease_articles_565(article_number, title)"),
        supabase
          .from("disease_articles_565")
          .select("id, article_number, title")
          .eq("is_active", true),
      ]);

      if (docsRes.error || linksRes.error || articlesRes.error) {
        console.error("[MedicalContext] Error loading:", docsRes.error, linksRes.error, articlesRes.error);
        return;
      }

      const docs = docsRes.data || [];
      const links = linksRes.data || [];
      console.log("[MedicalContext] Loaded", docs.length, "docs,", links.length, "links");

      if (docs.length === 0) {
        setMedicalContext("");
        medicalContextRef.current = "";
        return;
      }

      const now = new Date();
      const linksByDoc = new Map<string, typeof links>();
      for (const link of links) {
        const arr = linksByDoc.get(link.document_id) || [];
        arr.push(link);
        linksByDoc.set(link.document_id, arr);
      }

      let context = "=== МЕДИЦИНСКИЕ ДОКУМЕНТЫ ПОЛЬЗОВАТЕЛЯ ===\n\n";

      // Track best chances per article
      const articleBestChance = new Map<string, { chance: number; articleNum: string; title: string }>();

      for (const doc of docs) {
        const typeName = (doc as any).document_types?.name || "Не указан";
        const subtypeName = (doc as any).document_subtypes?.name;
        const docTitle = doc.title || "Без названия";

        let dateLine = "Дата не указана";
        let ageMonths = 0;
        if (doc.document_date) {
          const docDate = new Date(doc.document_date);
          ageMonths = differenceInMonths(now, docDate);
          const formattedDate = format(docDate, "dd.MM.yyyy");
          dateLine = ageMonths > 0 ? `${formattedDate} (давность: ${ageMonths} мес.)` : formattedDate;
          if (ageMonths > 6) {
            dateLine += " ⚠️ УСТАРЕЛ";
          }
        }

        context += `Документ: ${docTitle}\n`;
        context += `Тип: ${typeName}${subtypeName ? ` / ${subtypeName}` : ""}\n`;
        context += `Дата: ${dateLine}\n`;

        const docLinks = linksByDoc.get(doc.id) || [];
        for (const link of docLinks) {
          const article = (link as any).disease_articles_565;
          if (!article) continue;
          const chance = link.ai_category_chance || 0;
          context += `  Статья ${article.article_number} (${article.title}) — шанс кат. В: ${chance}%\n`;
          if (link.ai_explanation) {
            context += `    Обоснование: ${link.ai_explanation}\n`;
          }
          if (link.ai_recommendations && link.ai_recommendations.length > 0) {
            context += `    Рекомендации: ${link.ai_recommendations.join("; ")}\n`;
          }

          // Track best chance per article
          const existing = articleBestChance.get(link.article_id);
          if (!existing || chance > existing.chance) {
            articleBestChance.set(link.article_id, { chance, articleNum: article.article_number, title: article.title });
          }
        }

        context += "\n";
      }

      // Summary
      context += `Всего документов: ${docs.length}\n`;

      const sortedArticles = [...articleBestChance.values()]
        .sort((a, b) => b.chance - a.chance)
        .slice(0, 5);

      if (sortedArticles.length > 0) {
        context += `Статьи с наибольшим шансом кат. В: ${sortedArticles.map(a => `Ст.${a.articleNum} (${a.chance}%)`).join(", ")}\n`;
      }

      const oldDocs = docs.filter(d => d.document_date && differenceInMonths(now, new Date(d.document_date)) > 6);
      if (oldDocs.length > 0) {
        context += `\n⚠️ ${oldDocs.length} из ${docs.length} документов старше 6 месяцев — рекомендуется обновить обследования.\n`;
      }

      const finalContext = context.substring(0, 50000);
      setMedicalContext(finalContext);
      medicalContextRef.current = finalContext;
      console.log("[MedicalContext] Context built:", finalContext.length, "chars");
    } catch (error) {
      console.error("[MedicalContext] Error building context:", error);
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
        navigate("/auth");
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

  const sendMessage = async () => {
    if (!input.trim()) return;

    if (!canAskAI()) {
      toast({
        title: "Лимит исчерпан",
        description: "Вы использовали все бесплатные вопросы AI. Оформите подписку для продолжения.",
        variant: "destructive",
      });
      return;
    }


    if (!currentConversationId) {
      await createNewConversation();
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    await saveMessage(userMessage);
    setInput("");
    setSending(true);

    try {
      const contextToSend = medicalContextRef.current;
      console.log("[Chat] Sending message with medicalContext:", contextToSend ? contextToSend.length + " chars" : "NONE");
      const response = await supabase.functions.invoke("chat", {
        body: { 
          messages: [...messages, userMessage],
          ...(contextToSend ? { medicalContext: contextToSend } : {}),
        },
      });

      if (response.error) throw response.error;

      // supabase.functions.invoke returns data as ReadableStream for SSE responses
      const streamData = response.data;
      const reader = (streamData?.body ?? streamData)?.getReader?.();
      const decoder = new TextDecoder();
      let assistantContent = "";

      if (!reader) {
        // Fallback: if data is not a stream, try to read it as text
        const text = typeof streamData === 'string' ? streamData : await streamData?.text?.() || '';
        // Try to extract content from non-streaming response
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) throw new Error(parsed.error);
          assistantContent = parsed.choices?.[0]?.message?.content || text;
        } catch {
          assistantContent = text || "Не удалось получить ответ";
        }
        const assistantMessage: Message = { role: "assistant", content: assistantContent };
        setMessages((prev) => [...prev, assistantMessage]);
        await saveMessage(assistantMessage);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content = assistantContent;
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      const assistantMessage: Message = { role: "assistant", content: assistantContent };
      await saveMessage(assistantMessage);
      await incrementAIQuestions();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось отправить сообщение",
        variant: "destructive",
      });
      setMessages((prev) => prev.slice(0, -1));
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
        <div className="md:hidden mb-2">
          <SubscriptionBanner compact />
        </div>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="hidden md:block w-64 flex-shrink-0 space-y-4">
            <SubscriptionBanner compact />
            <Card className="h-full">
              <CardContent className="p-4">
                <SidebarContent />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2">
            {isMobile && (
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
          </div>

          <Card className="flex flex-col h-[calc(100vh-240px)] md:h-[calc(100vh-180px)]">
            <CardHeader className="pb-3 sm:pb-4 flex-shrink-0">
              <CardTitle className="text-lg sm:text-xl">AI Юридический консультант</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Консультация по вопросам призыва и воинского учёта
              </p>
              {medicalContextLoading ? (
                <p className="text-xs text-muted-foreground animate-pulse">⏳ Загрузка медицинских данных...</p>
              ) : medicalContext ? (
                <p className="text-xs text-green-600 dark:text-green-400">✅ Медицинские данные загружены — ИИ видит ваши документы</p>
              ) : (
                <p className="text-xs text-muted-foreground">📋 Загрузите документы, чтобы ИИ мог учитывать вашу ситуацию</p>
              )}
            </CardHeader>
            <CardContent className="flex flex-col flex-1 p-2 sm:p-6 min-h-0 overflow-hidden">
              <ScrollArea className="flex-1 mb-4" ref={scrollAreaRef}>
                <div className="space-y-3 sm:space-y-4 pr-2 sm:pr-4">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8 sm:py-12 px-4">
                      <p className="text-[13px] sm:text-base leading-relaxed">Задайте вопрос юридическому AI консультанту</p>
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
                            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-[13.5px] sm:text-[14.5px] leading-[1.65] [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_hr]:hidden [&_p]:break-words [&_li]:break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:pl-5 [&_strong]:font-semibold">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {enhanceTypography(bubble.trim())}
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

              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Введите ваш вопрос..."
                  className="resize-none text-sm sm:text-base"
                  rows={isMobile ? 2 : 3}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  size="icon"
                  className="self-end h-9 w-9 sm:h-10 sm:w-10"
                >
                  <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AIChatDashboardPage;