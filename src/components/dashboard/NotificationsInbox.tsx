import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  MessageSquare,
  Brain,
  AlertTriangle,
  Calendar,
  Crown,
  ChevronRight,
  Check,
  Scale,
} from "lucide-react";
import { differenceInDays, differenceInMonths, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { CRM_STAGE_LABELS } from "@/lib/crmStages";

type NotificationKind =
  | "lawyer-message"
  | "ai-ready"
  | "doc-stale"
  | "case-upcoming"
  | "subscription-expiring"
  | "case-stage";

interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  ctaPath: string;
  ctaLabel: string;
  urgency: "high" | "medium" | "low";
  createdAt?: string;
}

const kindMeta: Record<
  NotificationKind,
  { icon: typeof Bell; color: string; bgColor: string }
> = {
  "lawyer-message": { icon: MessageSquare, color: "text-ink", bgColor: "bg-ink/10" },
  "ai-ready": { icon: Brain, color: "text-gold-deep", bgColor: "bg-gold/15" },
  "doc-stale": { icon: AlertTriangle, color: "text-seal", bgColor: "bg-seal/10" },
  "case-upcoming": { icon: Calendar, color: "text-gold-deep", bgColor: "bg-gold/15" },
  "subscription-expiring": { icon: Crown, color: "text-seal", bgColor: "bg-seal/10" },
  "case-stage": { icon: Scale, color: "text-ink", bgColor: "bg-ink/10" },
};

const urgencyOrder = { high: 0, medium: 1, low: 2 };

/**
 * Единый инбокс уведомлений на дашборде.
 * Источники:
 *  - lawyer_chat_messages (непрочитанные)
 *  - medical_documents_v2 (только что проанализированные / устаревшие)
 *  - case_events (ближайшие за 14 дней)
 *  - user_subscriptions (истекает в течение 7 дней)
 */
export default function NotificationsInbox() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { unreadCount } = useUnreadMessages();
  const { subscription, isActive } = useSubscription();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || session.user.is_anonymous) {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }
        const userId = session.user.id;
        const now = new Date();

        const collected: Notification[] = [];

        // 1. Непрочитанные сообщения от юриста
        if (unreadCount > 0) {
          collected.push({
            id: "lawyer-unread",
            kind: "lawyer-message",
            title: `${unreadCount} ${unreadCount === 1 ? "новое сообщение" : "новых сообщений"} от юриста`,
            description: "Откройте чат, чтобы ответить",
            ctaPath: "/client/messages",
            ctaLabel: "Открыть чат",
            urgency: "high",
          });
        }

        // 2. Документы: свежие AI-анализы и устаревшие
        const { data: docs } = await supabase
          .from("medical_documents_v2")
          .select("id, title, document_date, ai_fitness_category, ai_category_chance, uploaded_at")
          .eq("user_id", userId)
          .order("uploaded_at", { ascending: false })
          .limit(20);

        if (docs) {
          // Свежие анализы за последние 24 часа
          const freshAnalyses = docs.filter((d) => {
            if (!d.ai_fitness_category || !d.uploaded_at) return false;
            return differenceInDays(now, new Date(d.uploaded_at)) <= 1;
          });
          if (freshAnalyses.length > 0) {
            collected.push({
              id: "ai-fresh",
              kind: "ai-ready",
              title: `ИИ закончил анализ ${freshAnalyses.length} ${freshAnalyses.length === 1 ? "документа" : "документов"}`,
              description: `Лучший результат: кат. ${freshAnalyses[0].ai_fitness_category || "—"}, шанс В: ${freshAnalyses[0].ai_category_chance || 0}%`,
              ctaPath: "/dashboard/medical-documents",
              ctaLabel: "Посмотреть",
              urgency: "medium",
            });
          }

          // Устаревшие документы
          const stale = docs.filter(
            (d) => d.document_date && differenceInMonths(now, new Date(d.document_date)) > 6,
          );
          if (stale.length > 0) {
            collected.push({
              id: "docs-stale",
              kind: "doc-stale",
              title: `${stale.length} ${stale.length === 1 ? "документ" : stale.length < 5 ? "документа" : "документов"} устарели`,
              description: "Старше 6 месяцев — призывная комиссия может отказать. Обновите обследования.",
              ctaPath: "/dashboard/medical-documents",
              ctaLabel: "Обновить",
              urgency: "medium",
            });
          }
        }

        // 3. Ближайшие события дела
        const { data: events } = await supabase
          .from("case_events")
          .select("id, event_date, event_type, title")
          .eq("user_id", userId)
          .gte("event_date", now.toISOString().split("T")[0])
          .order("event_date", { ascending: true })
          .limit(3);

        if (events) {
          for (const ev of events) {
            const daysUntil = differenceInDays(new Date(ev.event_date), now);
            if (daysUntil > 14) continue;
            const urgency: "high" | "medium" = daysUntil <= 3 ? "high" : "medium";
            collected.push({
              id: `event-${ev.id}`,
              kind: "case-upcoming",
              title: `${ev.title}`,
              description:
                daysUntil === 0
                  ? "Сегодня"
                  : daysUntil === 1
                    ? "Завтра"
                    : `Через ${daysUntil} ${daysUntil < 5 ? "дня" : "дней"} · ${format(new Date(ev.event_date), "d MMMM", { locale: ru })}`,
              ctaPath: "/dashboard/case-tracking",
              ctaLabel: "Открыть",
              urgency,
            });
          }
        }

        // 4. Подписка скоро истекает
        if (isActive() && subscription?.paid_until) {
          const daysLeft = differenceInDays(new Date(subscription.paid_until), now);
          if (daysLeft >= 0 && daysLeft <= 7) {
            collected.push({
              id: "sub-expiring",
              kind: "subscription-expiring",
              title: `Подписка истекает через ${daysLeft} ${daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}`,
              description: "Продлите, чтобы не потерять безлимитный доступ к ИИ и документам",
              ctaPath: "/dashboard",
              ctaLabel: "Продлить",
              urgency: daysLeft <= 2 ? "high" : "low",
            });
          }
        }

        // 5. Юрист сменил этап дела (с последнего просмотра дашборда)
        try {
          const { data: caseRow } = await (supabase as any)
            .from("lawyer_clients")
            .select("crm_stage, link_state")
            .eq("client_user_id", userId)
            .eq("link_state", "linked_active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (caseRow?.crm_stage) {
            const key = `nepriziv_seen_stage_${userId}`;
            const seen = localStorage.getItem(key);
            if (seen && seen !== caseRow.crm_stage) {
              collected.push({
                id: "case-stage",
                kind: "case-stage",
                title: "Юрист обновил этап вашего дела",
                description: `Текущий этап: ${CRM_STAGE_LABELS[caseRow.crm_stage] || caseRow.crm_stage}`,
                ctaPath: "/client/messages",
                ctaLabel: "Подробнее",
                urgency: "medium",
              });
            }
            localStorage.setItem(key, caseRow.crm_stage);
          }
        } catch {
          /* необязательное уведомление — ошибки игнорируем */
        }

        // Сортируем по срочности
        collected.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

        if (!cancelled) {
          setItems(collected);
          setLoading(false);
        }
      } catch (err) {
        console.error("NotificationsInbox load error", err);
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [unreadCount, subscription, isActive]);

  if (loading) return null;
  if (items.length === 0) {
    return (
      <Card className="border-border/50 bg-muted/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
            <Check className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Всё спокойно</p>
            <p className="text-xs text-muted-foreground">Новых событий по делу нет</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visible = expanded ? items : items.slice(0, 3);
  const hidden = items.length - visible.length;
  const highUrgencyCount = items.filter((i) => i.urgency === "high").length;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        highUrgencyCount > 0 ? "border-seal/30 bg-seal/[0.03]" : "border-border/60",
      )}
    >
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell
              className={cn(
                "h-4 w-4",
                highUrgencyCount > 0 ? "text-seal" : "text-muted-foreground",
              )}
            />
            <span className="section-number">События по делу</span>
            {highUrgencyCount > 0 && (
              <Badge className="bg-seal text-paper text-[10px] h-4 px-1.5">
                {highUrgencyCount} срочно
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{items.length} всего</span>
        </div>

        <div className="divide-y divide-border/40">
          {visible.map((item) => {
            const meta = kindMeta[item.kind];
            const Icon = meta.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.ctaPath)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/40 transition-colors group"
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    meta.bgColor,
                  )}
                >
                  <Icon className={cn("h-4 w-4", meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors flex-shrink-0 mt-1" />
              </button>
            );
          })}
        </div>

        {hidden > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border/40"
          >
            Показать ещё {hidden}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
