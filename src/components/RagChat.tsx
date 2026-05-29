import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { X, BookOpen, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const EDGE_URL = "https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/chat-rag";

const HIDDEN_ROUTES = [
  "/auth", "/login", "/register", "/reset-password",
  "/dashboard", "/lawyer/chat", "/client/chat",
];

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Привет! Я AI-помощник nepriziv.ru. Отвечаю на вопросы о призыве, категориях годности и Расписании болезней на основе базы знаний.\n\nЧем могу помочь?",
};

export function RagChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag state — offset from default bottom-right anchor
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragStartRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  const isCabinetRoute = /\/(dashboard|client|lawyer)(\/|$)/.test(location.pathname);
  const hidden =
    HIDDEN_ROUTES.some((r) => location.pathname.startsWith(r)) ||
    isCabinetRoute;

  useEffect(() => {
    if (!hidden && open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, hidden]);

  useEffect(() => {
    if (!hidden && open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open, hidden]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    didDragRef.current = false;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
    // Clamp so button stays within viewport
    const newX = Math.max(-window.innerWidth + 80, Math.min(0, dragStartRef.current.ox + dx));
    const newY = Math.max(-window.innerHeight + 80, Math.min(0, dragStartRef.current.oy + dy));
    setOffset({ x: newX, y: newY });
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (!didDragRef.current) setOpen((v) => !v);
  };

  // ── AI chat ────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);
    const history = updatedMessages.slice(1, -1).map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка сервера: ${res.status}`);
      }
      if (!res.body) throw new Error("Пустой ответ от сервера");
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: assistantText }]);
            }
          } catch { /* ignore partial JSON */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (hidden) return null;

  // Transform string to move both button and panel together
  const translateStyle = { transform: `translate(${offset.x}px, ${offset.y}px)` };

  return (
    <>
      {/* ── Floating toggle button ─────────────────────────────────────────── */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={translateStyle}
        className={cn(
          "fixed z-40 flex items-center gap-2 rounded-full shadow-xl transition-shadow duration-200",
          "bg-gradient-to-br from-primary to-accent text-white",
          "hover:shadow-2xl select-none touch-none",
          // Mobile: compact icon-only button on left side
          "left-4 bottom-20 h-12 w-12 justify-center",
          // Desktop: wider pill button on right with label
          "md:left-auto md:right-6 md:bottom-6 md:h-14 md:w-auto md:px-5 md:gap-2.5",
          // Drag cursor on desktop
          "md:cursor-grab active:md:cursor-grabbing",
        )}
        aria-label={open ? "Закрыть базу знаний" : "Открыть базу знаний"}
      >
        {open
          ? <X className="h-5 w-5 shrink-0" />
          : <BookOpen className="h-5 w-5 shrink-0" />}
        <span className="hidden md:inline text-sm font-semibold whitespace-nowrap">
          {open ? "Закрыть" : "База знаний"}
        </span>
      </button>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={translateStyle}
          className={cn(
            "fixed z-40 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden",
            // Mobile: near full-screen above MobileBottomNav
            "left-2 right-2 bottom-36 top-16",
            // Desktop: fixed panel above the button
            "md:inset-auto md:right-6 md:bottom-24 md:w-[400px] md:h-[560px]",
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
          )}
        >
          {/* Header — drag handle on desktop */}
          <div
            className={cn(
              "flex items-center justify-between px-4 py-3",
              "bg-gradient-to-r from-primary to-accent text-white shrink-0",
              "md:cursor-grab active:md:cursor-grabbing select-none",
            )}
          >
            <div>
              <p className="font-semibold text-sm">База знаний nepriziv.ru</p>
              <p className="text-xs opacity-80">Ответы по призыву и расписанию болезней</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm",
                )}>
                  {m.content
                    ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:text-current prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <p className="font-bold">{children}</p>,
                            h2: ({ children }) => <p className="font-bold">{children}</p>,
                            h3: ({ children }) => <p className="font-semibold">{children}</p>,
                            hr: () => <div className="border-t border-current opacity-20 my-2" />,
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )
                    : (
                      <span className="flex items-center gap-1 opacity-60">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Печатает...</span>
                      </span>
                    )}
                </div>
              </div>
            ))}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 p-3 border-t border-gray-100 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спросите о диагнозе или процедуре..."
              rows={1}
              disabled={loading}
              className={cn(
                "flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                "disabled:opacity-50 placeholder:text-gray-400 max-h-24 overflow-y-auto",
              )}
              style={{ minHeight: "40px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 96) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className={cn(
                "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-primary text-white transition-all",
                "hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              aria-label="Отправить"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default RagChat;
