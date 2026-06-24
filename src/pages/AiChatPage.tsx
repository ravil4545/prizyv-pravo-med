import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Send, Loader2, Bot, Sparkles, ArrowRight, ShieldCheck, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";

// Публичный ИИ-чат БЕЗ регистрации — главный «вход в ценность» для холодного трафика.
// Раньше любой клик по «ИИ» вёл незалогиненного на /auth; из анонимной воронки было
// 0 регистраций (аудит конверсии 2026-06-25). Здесь человек сразу получает ответ, и
// только после нескольких вопросов — мягкое предложение создать аккаунт.
const EDGE_URL = "https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/chat-rag";
const FREE_LIMIT = 3;                       // бесплатных вопросов до предложения регистрации
const COUNT_KEY = "nepriziv_ai_public_count";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Здравствуйте! Я ИИ-помощник nepriziv.ru. Спросите про ваш диагноз, категорию годности или Расписание болезней — отвечу бесплатно на основе базы знаний.\n\nНапример: «Возьмут ли в армию с плоскостопием 3 степени?»",
};

const AiChatPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<number>(() => Number(localStorage.getItem(COUNT_KEY) || 0));
  const [isAuthed, setIsAuthed] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) =>
      setIsAuthed(!!session && !session.user.is_anonymous),
    );
    trackEvent("ai_public_open");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const gateShown = !isAuthed && asked >= FREE_LIMIT;

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading || gateShown) return;
      setInput("");
      setError(null);
      const updated: Message[] = [...messages, { role: "user", content: text }];
      setMessages(updated);
      setLoading(true);
      const history = updated.slice(1, -1).map((m) => ({ role: m.role, content: m.content }));
      trackEvent("ai_public_question");
      try {
        const res = await fetch(EDGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка сервера: ${res.status}`);
        }
        setMessages((p) => [...p, { role: "assistant", content: "" }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta?.content;
              if (delta) {
                acc += delta;
                setMessages((p) => [...p.slice(0, -1), { role: "assistant", content: acc }]);
              }
            } catch {
              /* ignore partial JSON */
            }
          }
        }
        const next = asked + 1;
        setAsked(next);
        localStorage.setItem(COUNT_KEY, String(next));
        if (!isAuthed && next >= FREE_LIMIT) trackEvent("ai_public_gate_shown");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка соединения");
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, asked, isAuthed, gateShown],
  );

  // Автозапуск вопроса из ?q= (поле «Спросить ИИ» на главной ведёт сюда).
  useEffect(() => {
    const q = params.get("q");
    if (q && !startedRef.current) {
      startedRef.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const goSignup = () => {
    trackEvent("ai_public_gate_signup_click");
    navigate("/auth?mode=signup&next=/dashboard/ai-chat");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Спросить ИИ о призыве бесплатно — nepriziv.ru"
        description="Бесплатный ИИ-помощник по призыву: категории годности, Расписание болезней (Пост. №565), отсрочки и освобождение. Ответ за секунды, без регистрации."
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-6 sm:py-8 w-full max-w-3xl flex flex-col">
        {/* Заголовок */}
        <div className="mb-4 sm:mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Бесплатно, без регистрации
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Возьмут ли вас в армию? Спросите ИИ
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
            Отвечаю по Расписанию болезней (Пост.&nbsp;№565) и практике. Не заменяет очную
            консультацию юриста, но поможет разобраться за секунды.
          </p>
        </div>

        {/* Лента сообщений */}
        <div className="flex-1 rounded-2xl border border-border bg-card/40 p-3 sm:p-4 space-y-3 overflow-y-auto min-h-[320px]">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-2.5 leading-relaxed break-words text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm",
                )}
              >
                {m.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-strong:text-current prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <p className="font-bold">{children}</p>,
                        h2: ({ children }) => <p className="font-bold">{children}</p>,
                        h3: ({ children }) => <p className="font-semibold">{children}</p>,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 opacity-60">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Печатает…
                  </span>
                )}
              </div>
            </div>
          ))}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Мягкое предложение регистрации после лимита */}
        {gateShown ? (
          <div className="mt-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 text-center">
            <p className="font-semibold text-base">Вы задали {FREE_LIMIT} бесплатных вопроса</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Создайте бесплатный аккаунт, чтобы продолжить без лимита, сохранить переписку и
              загрузить документы для анализа ИИ.
            </p>
            <button
              onClick={goSignup}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Создать бесплатный аккаунт
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Без обязательств
              </span>
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Конфиденциально
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Напишите диагноз или вопрос…"
              rows={1}
              disabled={loading}
              className={cn(
                "flex-1 resize-none border border-border rounded-xl px-4 py-3 text-sm bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary",
                "disabled:opacity-50 placeholder:text-muted-foreground max-h-32 overflow-y-auto",
              )}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 h-11 w-11 rounded-xl flex items-center justify-center bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Отправить"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
          <Bot className="h-3 w-3" /> ИИ может ошибаться. Важные решения проверяйте с юристом.
        </p>
      </main>

      <Footer />
    </div>
  );
};

export default AiChatPage;
