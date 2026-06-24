/* eslint-disable @typescript-eslint/no-explicit-any -- analytics_events читается динамически */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, MousePointerClick, Compass, Activity } from "lucide-react";

// Раздел «Поведение» в админ-аналитике: откуда приходят (источники), что кликают
// (наш трекинг кликов → analytics_events event_type='click'), что делают (события
// по типу). Визуальные тепловые карты и записи путей — в Яндекс.Метрике (ссылка).
const METRIKA_ID = 109765864;

interface SourceStat { source: string; sessions: number }
interface ClickStat { label: string; count: number }
interface EventTypeStat { type: string; count: number }

// Человеко-читаемые названия наших событий воронки.
const EVENT_LABELS: Record<string, string> = {
  page_view: "Просмотр страницы",
  click: "Клик (любой)",
  hero_ai_ask: "Поле «Спросить ИИ» на главной",
  ai_public_open: "Открыл публичный ИИ-чат /ai",
  ai_public_question: "Задал вопрос ИИ (без входа)",
  ai_public_gate_shown: "Показано предложение регистрации",
  ai_public_gate_signup_click: "Клик «создать аккаунт» из /ai",
  auth_view: "Открыл форму входа/регистрации",
  auth_oauth_click: "Клик входа через Google/и т.п.",
  auth_signup_submit: "Отправил форму регистрации",
  auth_signup_error: "Ошибка при регистрации",
  auth_signup: "Регистрация успешна",
  auth_signin_success: "Вход выполнен",
  hero_cta_phone: "Кнопка «бесплатный разбор» (звонок)",
  hero_cta_trial: "Кнопка «ИИ-кабинет»",
  hero_cta_telegram: "Кнопка Telegram",
  hero_cta_whatsapp: "Кнопка WhatsApp",
  subscription_trial_click: "Клик «начать пробный период»",
  contact_form_submit: "Отправил форму обратной связи",
  scroll_50: "Долистал до 50%",
  scroll_75: "Долистал до 75%",
  scroll_100: "Долистал до конца",
};

const sourceOf = (ref: string | null): string => {
  if (!ref) return "Прямые / нет источника";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (h.includes("nepriziv")) return "Внутренние переходы";
    if (h.includes("yandex") || h === "ya.ru") return "Yandex";
    if (h.includes("google")) return "Google";
    if (h.includes("t.me") || h.includes("telegram")) return "Telegram";
    if (h.includes("vk.com") || h.includes("vk.ru")) return "VK";
    if (h.includes("mail.ru")) return "Mail.ru";
    if (h.includes("bing")) return "Bing";
    if (h.includes("duckduckgo")) return "DuckDuckGo";
    return h;
  } catch {
    return "Другое";
  }
};

export default function AdminBehavior() {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [clicks, setClicks] = useState<ClickStat[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeStat[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("analytics_events")
        .select("session_id, event_type, referrer, event_ref")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(12000);
      const rows = (data as any[]) || [];

      const srcMap = new Map<string, Set<string>>();
      const clickMap = new Map<string, number>();
      const etMap = new Map<string, number>();
      const allSessions = new Set<string>();

      rows.forEach((e) => {
        if (e.session_id) allSessions.add(e.session_id);
        etMap.set(e.event_type, (etMap.get(e.event_type) || 0) + 1);
        if (e.event_type === "page_view") {
          const cat = sourceOf(e.referrer);
          if (!srcMap.has(cat)) srcMap.set(cat, new Set());
          srcMap.get(cat)!.add(e.session_id);
        }
        if (e.event_type === "click" && e.event_ref) {
          clickMap.set(e.event_ref, (clickMap.get(e.event_ref) || 0) + 1);
        }
      });

      setTotalSessions(allSessions.size);
      setSources(
        Array.from(srcMap, ([source, s]) => ({ source, sessions: s.size })).sort((a, b) => b.sessions - a.sessions),
      );
      setClicks(
        Array.from(clickMap, ([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 30),
      );
      setEventTypes(Array.from(etMap, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count));
      setLoading(false);
    })();
  }, []);

  const maxSrc = sources[0]?.sessions || 1;
  const maxClick = clicks[0]?.count || 1;

  return (
    <div className="space-y-4">
      {/* Связка с Яндекс.Метрикой */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <Compass className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Тепловые карты, карта кликов и пути посетителей — в Яндекс.Метрике</p>
              <p className="text-xs text-muted-foreground">
                Счётчик {METRIKA_ID} уже собирает данные о каждом заходе. Здесь — наши агрегаты по базе; визуальные
                карты «куда смотрят и что кликают» и записи путей открываются в Метрике.
              </p>
            </div>
          </div>
          <a
            href={`https://metrika.yandex.ru/dashboard?id=${METRIKA_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Открыть Метрику <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Источники */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="h-4 w-4 text-primary" /> Откуда приходят
              </CardTitle>
              <CardDescription>Источники по referrer · уникальные сессии · 30 дней</CardDescription>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Нет данных за период</p>
              ) : (
                <div className="space-y-2">
                  {sources.map((s) => (
                    <div key={s.source}>
                      <div className="mb-0.5 flex justify-between text-sm">
                        <span className="truncate pr-2">{s.source}</span>
                        <span className="font-mono font-semibold">{s.sessions}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${Math.max((s.sessions / maxSrc) * 100, 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Клики */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MousePointerClick className="h-4 w-4 text-primary" /> Что кликают
              </CardTitle>
              <CardDescription>Топ кнопок и ссылок по числу кликов · 30 дней</CardDescription>
            </CardHeader>
            <CardContent>
              {clicks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Пока нет данных — трекинг кликов начнёт собирать сразу после публикации.
                </p>
              ) : (
                <div className="space-y-2">
                  {clicks.map((c) => (
                    <div key={c.label}>
                      <div className="mb-0.5 flex justify-between text-sm">
                        <span className="truncate pr-2" title={c.label}>{c.label}</span>
                        <span className="font-mono font-semibold">{c.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-seal" style={{ width: `${Math.max((c.count / maxClick) * 100, 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* События по типу */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" /> Что делают — события за 30 дней
              </CardTitle>
              <CardDescription>Всего уникальных сессий за период: {totalSessions}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {eventTypes.map((et) => (
                  <Badge key={et.type} variant="outline" className="gap-1.5 py-1 text-xs font-normal">
                    <span>{EVENT_LABELS[et.type] || et.type}</span>
                    <span className="font-mono font-semibold text-foreground">{et.count}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
