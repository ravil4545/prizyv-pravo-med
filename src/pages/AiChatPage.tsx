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
import { readOpenAICompatibleStream, type ChatResponseMetadata } from "@/lib/openaiSse";
import { ChatSourcesDisclosure } from "@/components/chat/ChatSourcesDisclosure";
import {
  PUBLIC_AI_FREE_LIMIT,
  PUBLIC_AI_COUNT_KEY,
  PUBLIC_AI_FREE_LABEL,
  remainingLabel,
  plural,
} from "@/lib/aiLimits";

// Публичный ИИ-чат БЕЗ регистрации — главный «вход в ценность» для холодного трафика.
// Раньше любой клик по «ИИ» вёл незалогиненного на /auth; из анонимной воронки было
// 0 регистраций (аудит конверсии 2026-06-25). Здесь человек сразу получает ответ, и
// только после нескольких вопросов — мягкое предложение создать аккаунт.
const EDGE_URL = "https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/chat-rag";
// Лимит и формулировки — из единого источника (@/lib/aiLimits), иначе обещание
// на главной, здесь и в плавающем виджете снова разъедется.
const FREE_LIMIT = PUBLIC_AI_FREE_LIMIT;
const COUNT_KEY = PUBLIC_AI_COUNT_KEY;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: ChatResponseMetadata;
}

const WELCOME: Message = {
  id: "welcome",
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
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [asked, setAsked] = useState<number>(() => Number(localStorage.getItem(COUNT_KEY) || 0));
  const [isAuthed, setIsAuthed] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const loadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) =>
      setIsAuthed(!!session && !session.user.is_anonymous),
    );
    trackEvent("ai_public_open");
  }, []);

  useEffect(() => {
    const viewport = messagesRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const gateShown = !isAuthed && asked >= FREE_LIMIT;

  const send = useCallback(
    async (raw: string, retry = false) => {
      const text = raw.trim();
      if (!text || loadingRef.current || gateShown) return;

      loadingRef.current = true;
      setInput("");
      setError(null);
      setFailedPrompt(null);

      const existingRetryMessage = retry &&
        messages[messages.length - 1]?.role === "user" &&
        messages[messages.length - 1]?.content === text;
      const updated: Message[] = existingRetryMessage
        ? messages
        : [...messages, { id: crypto.randomUUID(), role: "user", content: text }];
      setMessages(updated);
      setLoading(true);

      const history = updated.slice(1, -1).map((m) => ({ role: m.role, content: m.content }));
      const assistantMessageId = crypto.randomUUID();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const timeoutId = window.setTimeout(() => abortController.abort(), 60_000);
      trackEvent("ai_public_question");

      try {
        const res = await fetch(EDGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
          signal: abortController.signal,
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Ошибка сервера: ${res.status}`);
        }

        let acc = "";
        let responseMetadata: ChatResponseMetadata | undefined;
        await readOpenAICompatibleStream(res.body, (delta) => {
          acc += delta;
          setMessages((previous) => {
            const assistantIndex = previous.findIndex((item) => item.id === assistantMessageId);
            if (assistantIndex < 0) {
              return [...previous, {
                id: assistantMessageId,
                role: "assistant",
                content: acc,
                metadata: responseMetadata,
              }];
            }
            return previous.map((item, index) =>
              index === assistantIndex
                ? { ...item, content: acc, metadata: responseMetadata }
                : item
            );
          });
        }, (metadata) => {
          responseMetadata = metadata;
          setMessages((previous) => previous.map((item) =>
            item.id === assistantMessageId ? { ...item, metadata } : item
          ));
        });

        if (!acc.trim()) throw new Error("ИИ вернул пустой ответ. Попробуйте ещё раз.");

        const next = asked + 1;
        setAsked(next);
        localStorage.setItem(COUNT_KEY, String(next));
        if (!isAuthed && next >= FREE_LIMIT) trackEvent("ai_public_gate_shown");
      } catch (err) {
        setMessages((previous) => previous.filter((item) => item.id !== assistantMessageId));
        const isAbort = err instanceof Error && err.name === "AbortError";
        setError(
          isAbort
            ? "ИИ не успел ответить. Попробуйте ещё раз через минуту."
            : err instanceof Error
            ? err.message
            : "Ошибка соединения",
        );
        setFailedPrompt(text);
      } finally {
        window.clearTimeout(timeoutId);
        if (abortControllerRef.current === abortController) abortControllerRef.current = null;
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [messages, asked, isAuthed, gateShown],
  );

  // Автозапуск вопроса из ?q= (поле «Спросить ИИ» на главной ведёт сюда).
  useEffect(() => {
    const q = params.get("q");
    if (q && !startedRef.current) {
      startedRef.current = true;
      send(q);
    }
  }, [params, send]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

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
          {/* Лимит назван сразу: раньше плашка обещала просто «бесплатно», а поле
              ввода молча исчезало после третьего ответа — это читалось как поломка. */}
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" /> {PUBLIC_AI_FREE_LABEL}
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
        {/* ym-hide-content: тексты вопросов/ответов о здоровье не попадают в записи Webvisor (152-ФЗ) */}
        <div
          ref={messagesRef}
          className="h-[56dvh] min-h-[320px] max-h-[560px] flex-none overscroll-contain rounded-2xl border border-border bg-card/40 p-3 sm:p-4 space-y-3 overflow-y-auto ym-hide-content"
        >
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-2.5 leading-relaxed break-words text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "border border-border bg-card text-card-foreground shadow-sm rounded-tl-sm",
                )}
              >
                {m.content && (
                  <div
                    className={cn(
                      "prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0",
                      m.role === "user"
                        ? "text-primary-foreground prose-p:text-primary-foreground prose-li:text-primary-foreground prose-strong:text-primary-foreground prose-headings:text-primary-foreground prose-a:text-primary-foreground"
                        : "text-card-foreground prose-p:text-card-foreground prose-li:text-card-foreground prose-strong:text-card-foreground prose-headings:text-card-foreground prose-a:text-primary",
                    )}
                  >
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
                    {m.role === "assistant" && <ChatSourcesDisclosure metadata={m.metadata} />}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm text-card-foreground shadow-sm">
                <span className="flex items-center gap-1.5 opacity-60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> ИИ думает…
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span>{error}</span>
              {failedPrompt && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => send(failedPrompt, true)}
                  className="flex-shrink-0 rounded-lg border border-destructive/30 bg-background px-2.5 py-1.5 font-medium hover:bg-destructive/5 disabled:opacity-50"
                >
                  Повторить
                </button>
              )}
            </div>
          )}
        </div>

        {/* Мягкое предложение регистрации после лимита */}
        {gateShown ? (
          <div className="mt-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 text-center">
            <p className="font-semibold text-base">
              Вы задали {FREE_LIMIT} бесплатных {plural(FREE_LIMIT, "вопрос", "вопроса", "вопросов")}
            </p>
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Bot className="h-3 w-3" /> ИИ может ошибаться. Важные решения проверяйте с юристом.
          </p>
          {/* Честный счётчик — человек видит, сколько осталось, и гейт не выглядит сбоем. */}
          {!isAuthed && !gateShown && remainingLabel(asked) && (
            <p className="text-[11px] font-medium text-muted-foreground/80 tabular-nums">
              {remainingLabel(asked)}
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AiChatPage;
