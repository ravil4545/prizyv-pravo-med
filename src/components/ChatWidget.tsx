import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Phone, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enhanceTypography } from "@/lib/typography";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "chat_widget_history";
const DEFAULT_MESSAGE: Message = {
  role: "assistant",
  content: "Здравствуйте! Я виртуальный помощник юридической консультации. Чем могу помочь вам с вопросами призыва?",
};

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage on initial render
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
    return [DEFAULT_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CHAT_URL = `https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/chat`;

  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading, scrollToBottom]);

  const handleClearHistory = () => {
    setMessages([DEFAULT_MESSAGE]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Scroll after user message
    setTimeout(scrollToBottom, 50);

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });

      if (response.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Превышен лимит запросов. Пожалуйста, попробуйте позже или свяжитесь с нами напрямую по телефону +7 (925) 350-05-33",
          },
        ]);
        setIsLoading(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error("Ошибка сервера");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith(":") || !line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = assistantMessage;
                return newMessages;
              });
              // Scroll during streaming
              scrollToBottom();
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: "Извините, произошла ошибка. Пожалуйста, свяжитесь с нами напрямую: +7 (925) 350-05-33",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePhone = () => {
    window.location.href = "tel:+79253500533";
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-2 sm:right-4 z-50">
      {isOpen && (
        <Card className="mb-4 w-[calc(100vw-1rem)] sm:w-96 h-[80vh] sm:h-[500px] max-h-[600px] shadow-strong border-0 bg-background flex flex-col overflow-hidden">
          <CardHeader className="pb-2 sm:pb-3 border-b flex-shrink-0 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-medium">AI Консультант</CardTitle>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                  title="Очистить историю"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePhone}
                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                >
                  <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                >
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <ScrollArea className="flex-1 px-3 sm:px-4 py-3" ref={scrollRef}>
            <div className="space-y-3 sm:space-y-4 w-full">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex w-full ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      hyphens: 'auto'
                    }}
                  >
                    {message.role === "assistant" ? (
                      <div 
                        className="text-[13px] sm:text-sm leading-relaxed prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
                        style={{ 
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word'
                        }}
                      >
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({children}) => <p className="break-words">{children}</p>,
                            li: ({children}) => <li className="break-words">{children}</li>,
                            code: ({children}) => <code className="break-all text-xs">{children}</code>,
                            pre: ({children}) => <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{children}</pre>
                          }}
                        >
                          {enhanceTypography(message.content)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {enhanceTypography(message.content)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start w-full">
                  <div className="bg-gradient-to-r from-muted to-muted/80 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.6s" }} />
                      <span className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.6s" }} />
                      <span className="w-2.5 h-2.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.6s" }} />
                    </div>
                    <span className="text-[13px] sm:text-sm text-muted-foreground font-medium">
                      ИИ думает...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <CardContent className="pt-3 sm:pt-4 pb-3 border-t flex-shrink-0 px-3 sm:px-6">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Задайте вопрос..."
                disabled={isLoading}
                className="text-[15px] sm:text-base h-10 sm:h-11 rounded-xl"
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 rounded-xl"
              >
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 text-center">
              AI помощник • Для точной консультации звоните
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        variant="cta"
        size="lg"
        onClick={() => setIsOpen(!isOpen)}
        className="h-12 sm:h-14 px-4 sm:px-6 rounded-full shadow-strong hover:shadow-medium transition-bounce flex items-center gap-2"
      >
        {isOpen ? (
          <X className="h-5 w-5 sm:h-6 sm:w-6" />
        ) : (
          <>
            <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="font-semibold text-sm sm:text-base">Free AI</span>
          </>
        )}
      </Button>
    </div>
  );
};

export default ChatWidget;
