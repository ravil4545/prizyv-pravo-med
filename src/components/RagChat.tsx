import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, BookOpen, Send, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { readOpenAICompatibleStream } from "@/lib/openaiSse";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  PUBLIC_AI_FREE_LIMIT,
  PUBLIC_AI_COUNT_KEY,
  PUBLIC_AI_FREE_LABEL,
  remainingLabel,
  plural,
} from "@/lib/aiLimits";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RagChatProps {
  initialOpen?: boolean;
}

const EDGE_URL = "https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/chat-rag";

const HIDDEN_ROUTES = [
  "/auth", "/login", "/register", "/reset-password",
  "/dashboard", "/lawyer/chat", "/client/chat", "/ai",
];

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Привет! Я AI-помощник nepriziv.ru. Отвечаю на вопросы о призыве, категориях годности и Расписании болезней на основе базы знаний.\n\nЧем могу помочь?",
};

export function RagChat({ initialOpen = false }: RagChatProps) {
  const [open, setOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag state — offset from default bottom-right anchor
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragStartRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Счётчик общий с публичной страницей /ai: раньше виджет был обходом лимита —
  // на /ai гейт после 3 вопросов, а здесь можно было спрашивать бесконечно.
  const [asked, setAsked] = useState<number>(() => Number(localStorage.getItem(PUBLIC_AI_COUNT_KEY) || 0));
  const [isAuthed, setIsAuthed] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const gateShown = !isAuthed && asked >= PUBLIC_AI_FREE_LIMIT;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) =>
      setIsAuthed(!!session && !session.user.is_anonymous),
    );
  }, []);

  const isCabinetRoute = /\/(dashboard|client|lawyer)(\/|$)/.test(location.pathname);
  const hidden =
    HIDDEN_ROUTES.some((r) => location.pathname.startsWith(r)) ||
    isCabinetRoute;

  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen]);

  useEffect(() => {
    if (hidden || !open) return;
    const viewport = messagesRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
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
    if (!text || loading || gateShown) return;
    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);
    if (!isAuthed) {
      const next = asked + 1;
      setAsked(next);
      try { localStorage.setItem(PUBLIC_AI_COUNT_KEY, String(next)); } catch { /* приватный режим — игнор */ }
      if (next >= PUBLIC_AI_FREE_LIMIT) trackEvent("ai_public_gate_shown");
    }
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
      let assistantText = "";
      await readOpenAICompatibleStream(res.body, (delta) => {
        assistantText += delta;
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: assistantText }]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, gateShown, isAuthed, asked]);

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
          // Editorial-язык вместо градиента (§7.1): виджет висит поверх
          // страниц с острыми углами и палитрой paper/ink/gold, а сам был
          // из другой системы — градиент, скругление, чистый white.
          "fixed z-40 flex items-center gap-2 shadow-strong transition-shadow duration-200",
          "bg-ink text-paper border border-gold/40",
          "hover:shadow-2xl select-none touch-none",
          // Mobile: compact icon-only button on left side
          "left-4 bottom-20 h-12 w-12 justify-center",
          // Desktop: wider pill button on right with label
          "md:left-auto md:right-6 md:bottom-6 md:h-14 md:w-auto md:px-5 md:gap-2.5",
          // Drag cursor on desktop
          "md:cursor-grab active:md:cursor-grabbing",
        )}
        aria-label={open ? "Закрыть ИИ-чат" : "Спросить ИИ — бесплатно"}
      >
        {open
          ? <X className="h-5 w-5 shrink-0" />
          : <BookOpen className="h-5 w-5 shrink-0" />}
        <span className="hidden md:inline text-sm font-semibold whitespace-nowrap">
          {open ? "Закрыть" : "Спросить ИИ"}
        </span>
      </button>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={translateStyle}
          className={cn(
            "fixed z-40 flex flex-col bg-paper shadow-2xl border border-ink/20 overflow-hidden",
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
              "bg-ink text-paper shrink-0",
              "md:cursor-grab active:md:cursor-grabbing select-none",
            )}
          >
            <div>
              <p className="font-semibold text-sm">ИИ-помощник</p>
              <p className="text-xs opacity-80">
                {isAuthed ? "Берут ли в армию с вашим диагнозом?" : PUBLIC_AI_FREE_LABEL}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-paper/15 transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages — ym-hide-content: переписка о здоровье не попадает в записи Webvisor (152-ФЗ) */}
          <div ref={messagesRef} className="flex-1 overscroll-contain overflow-y-auto p-3 space-y-3 text-sm ym-hide-content">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] px-3.5 py-2.5 leading-relaxed break-words shadow-sm",
                  m.role === "user"
                    ? "bg-ink text-paper"
                    : "border border-ink/15 bg-background text-ink",
                )}>
                  {m.content
                    ? (
                      <div
                        className={cn(
                          "prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0",
                          m.role === "user"
                            ? "text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground prose-strong:text-primary-foreground prose-headings:text-primary-foreground prose-a:text-primary-foreground"
                            : "text-ink prose-p:text-ink prose-li:text-ink prose-strong:text-ink prose-headings:text-ink prose-a:text-gold-deep",
                        )}
                      >
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
              <div className="text-xs text-seal bg-seal/5 border border-seal/30 px-3 py-2">{error}</div>
            )}
          </div>

          {/* Input / гейт — тот же лимит и та же формулировка, что и на /ai */}
          {gateShown ? (
            <div className="shrink-0 p-4 border-t border-ink/10 text-center">
              <p className="text-sm font-semibold text-ink">
                Вы задали {PUBLIC_AI_FREE_LIMIT} бесплатных{" "}
                {plural(PUBLIC_AI_FREE_LIMIT, "вопрос", "вопроса", "вопросов")}
              </p>
              <p className="text-xs text-ink-soft mt-1 mb-3">
                Создайте бесплатный аккаунт, чтобы продолжить без лимита и сохранить переписку.
              </p>
              <button
                onClick={() => {
                  trackEvent("ai_public_gate_signup_click");
                  navigate("/auth?mode=signup&next=/dashboard/ai-chat");
                }}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gold text-ink text-sm font-semibold hover:bg-gold-deep hover:text-paper transition-colors"
              >
                <Sparkles className="h-4 w-4" /> Создать бесплатный аккаунт
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="shrink-0 p-3 border-t border-ink/10">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Спросите о диагнозе или процедуре..."
                  rows={1}
                  disabled={loading}
                  className={cn(
                    "flex-1 resize-none border border-ink/20 bg-background px-3 py-2 text-sm text-ink",
                    "focus:outline-none focus:border-gold",
                    "disabled:opacity-50 placeholder:text-ink/35 max-h-24 overflow-y-auto",
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
                    "shrink-0 h-10 w-10 flex items-center justify-center bg-gold text-ink transition-all",
                    "hover:bg-gold-deep hover:text-paper active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                  aria-label="Отправить"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {/* Дисклеймер был только на /ai — в виджете его не хватало. */}
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink/45">
                <span>ИИ может ошибаться. Важные решения проверяйте с юристом.</span>
                {!isAuthed && remainingLabel(asked) && (
                  <span className="shrink-0 font-medium tabular-nums">{remainingLabel(asked)}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default RagChat;
