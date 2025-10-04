import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Plus, MessageSquare, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 flex gap-4">
        {/* Sidebar */}
        <div 
          className={`${sidebarOpen ? 'w-64' : 'w-12'} transition-all duration-300 flex-shrink-0`}
          onMouseEnter={() => setSidebarOpen(true)}
          onMouseLeave={() => setSidebarOpen(false)}
        >
          <Card className="h-full">
            <CardContent className="p-2">
              <Button
                size="sm"
                className="w-full mb-2"
                onClick={createNewConversation}
              >
                <Plus className="h-4 w-4" />
                {sidebarOpen && <span className="ml-2">Новый диалог</span>}
              </Button>
              
              {sidebarOpen && (
                <ScrollArea className="h-[calc(100vh-200px)]">
                  <div className="space-y-2">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-2 rounded cursor-pointer hover:bg-muted flex items-center justify-between ${
                          currentConversationId === conv.id ? 'bg-muted' : ''
                        }`}
                      >
                        <div 
                          className="flex-1 truncate"
                          onClick={() => setCurrentConversationId(conv.id)}
                        >
                          <MessageSquare className="h-4 w-4 inline mr-2" />
                          <span className="text-sm">{conv.title}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
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
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Chat */}
        <div className="flex-1 flex flex-col max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад в личный кабинет
            </Button>
          </div>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>AI Юридический консультант</CardTitle>
              <p className="text-sm text-muted-foreground">
                Консультация по вопросам призыва и воинского учёта
              </p>
            </CardHeader>
            <CardContent className="flex flex-col">
              <ScrollArea className="h-[calc(100vh-400px)] pr-4 mb-4">
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                      <p>Задайте вопрос юридическому AI консультанту</p>
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
                        className={`max-w-[80%] p-4 rounded-lg ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
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
                  className="resize-none"
                  rows={3}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  size="icon"
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
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