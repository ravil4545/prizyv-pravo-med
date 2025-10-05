import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

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

    if (!currentConversationId) {
      await createNewConversation();
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    await saveMessage(userMessage);
    setInput("");
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { messages: [...messages, userMessage] },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const reader = data.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

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
      <main className="flex-1 flex flex-col md:flex-row container mx-auto px-2 sm:px-4 py-4 md:py-8 gap-4">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="hidden md:block w-64 flex-shrink-0">
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

          <Card className="flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-180px)]">
            <CardHeader className="pb-3 sm:pb-4 flex-shrink-0">
              <CardTitle className="text-lg sm:text-xl">AI Юридический консультант</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Консультация по вопросам призыва и воинского учёта
              </p>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 p-2 sm:p-6 min-h-0">
              <ScrollArea className="flex-1 mb-4">
                <div className="space-y-3 sm:space-y-4 pr-2 sm:pr-4">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8 sm:py-12 px-4">
                      <p className="text-sm sm:text-base">Задайте вопрос юридическому AI консультанту</p>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[80%] p-3 sm:p-4 rounded-lg ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:my-1 sm:prose-p:my-2 prose-ul:my-1 sm:prose-ul:my-2 prose-ol:my-1 sm:prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {enhanceTypography(message.content)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm sm:text-base">{enhanceTypography(message.content)}</p>
                        )}
                      </div>
                    </div>
                  ))}
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