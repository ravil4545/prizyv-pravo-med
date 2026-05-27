import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Единый источник правды о непрочитанных сообщениях.
 *
 * До этого было 5 разных подписок (useUnreadMessages, LawyerChatsPage,
 * LawyerClientsPage, LawyerClientDetail.loadUnreadCounts, ClientChatPage) —
 * каждая на ВСЮ таблицу lawyer_chat_messages без фильтра, что давало N+1
 * запросов и шум realtime-сервера.
 *
 * Теперь:
 *   • Один канал supabase, подписан с фильтром recipient_id=auth.uid().
 *   • Кешируется unreadByConv: Map<lawyer_client_id, count>.
 *   • Компоненты читают через useChatPresence(), не подписываются сами.
 *
 * Точка переключения — миграция 20260527007000_chat_recipient_id.sql
 * (recipient_id заполняется триггером BEFORE INSERT).
 */

interface ChatPresenceValue {
  /** Сколько непрочитанных сообщений в каждом диалоге (по lawyer_client_id). */
  unreadByConv: Record<string, number>;
  /** Общее число непрочитанных у текущего юзера. */
  totalUnread: number;
  /** Полная перезагрузка из БД — на случай ручных правок или редкого рассинхрона. */
  refresh: () => Promise<void>;
  /** Подписаться на событие «пришло новое сообщение». Вернёт unsubscribe. */
  onNewMessage: (cb: (event: NewMessageEvent) => void) => () => void;
}

interface NewMessageEvent {
  lawyerClientId: string;
  messageId: string;
  senderId: string;
  recipientId: string;
}

const ChatPresenceContext = createContext<ChatPresenceValue | null>(null);

export const ChatPresenceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});
  const listenersRef = useRef<Set<(e: NewMessageEvent) => void>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setUnreadByConv({}); return; }
    // Берём все непрочитанные, адресованные мне (после миграции recipient_id —
    // прямой фильтр; до миграции — fallback на старую логику через JOIN).
    const { data, error } = await supabase
      .from("lawyer_chat_messages")
      .select("lawyer_client_id, recipient_id, sender_id, is_read")
      .eq("is_read", false)
      .neq("sender_id", user.id);
    if (error) { setUnreadByConv({}); return; }

    const map: Record<string, number> = {};
    (data || []).forEach((m: any) => {
      // recipient_id может быть NULL для исторических сообщений — там верифицируем
      // по sender_id != me + RLS уже отдала только наши диалоги.
      if (m.recipient_id && m.recipient_id !== user.id) return;
      if (!m.lawyer_client_id) return;
      map[m.lawyer_client_id] = (map[m.lawyer_client_id] || 0) + 1;
    });
    setUnreadByConv(map);
  }, [user?.id]);

  // Debounced refresh — серия быстрых событий триггерит один запрос.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => { refresh(); }, 400);
  }, [refresh]);

  // Один канал на всю сессию. Фильтр recipient_id — БД пуш-ит только нам.
  useEffect(() => {
    if (!user) return;
    refresh();

    const channel = supabase
      .channel(`chat-presence-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lawyer_chat_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as any;
          // Оптимистично инкрементим счётчик — без сетевого запроса.
          if (msg.lawyer_client_id && msg.sender_id !== user.id) {
            setUnreadByConv((prev) => ({
              ...prev,
              [msg.lawyer_client_id]: (prev[msg.lawyer_client_id] || 0) + 1,
            }));
            // Эмитим подписчикам — пусть компоненты обновят UI (например, список чатов перетасуется)
            listenersRef.current.forEach((cb) =>
              cb({
                lawyerClientId: msg.lawyer_client_id,
                messageId: msg.id,
                senderId: msg.sender_id,
                recipientId: msg.recipient_id,
              }),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lawyer_chat_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          // is_read мог стать true (прочитали) — пересчитываем.
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, refresh, scheduleRefresh]);

  const onNewMessage = useCallback((cb: (e: NewMessageEvent) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const totalUnread = useMemo(
    () => Object.values(unreadByConv).reduce((a, b) => a + b, 0),
    [unreadByConv],
  );

  const value = useMemo<ChatPresenceValue>(
    () => ({ unreadByConv, totalUnread, refresh, onNewMessage }),
    [unreadByConv, totalUnread, refresh, onNewMessage],
  );

  return <ChatPresenceContext.Provider value={value}>{children}</ChatPresenceContext.Provider>;
};

/**
 * Хук для чтения непрочитанных сообщений и подписки на события.
 * Возвращает стабильные ссылки — можно использовать в эффектах без лишних
 * перерендеров.
 */
export const useChatPresence = (): ChatPresenceValue => {
  const ctx = useContext(ChatPresenceContext);
  if (!ctx) {
    // Безопасный fallback: компонент рендерится вне провайдера (например, во
    // время раннего bootstrap). Возвращаем пустое состояние, чтобы UI не падал.
    return {
      unreadByConv: {},
      totalUnread: 0,
      refresh: async () => {},
      onNewMessage: () => () => {},
    };
  }
  return ctx;
};
