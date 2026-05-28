import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatPresence } from "@/contexts/ChatPresenceContext";

export interface LawyerConversation {
  id: string;
  client_name: string;
  crm_stage: string;
  client_phone: string | null;
  updated_at: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

interface ConvRow {
  id: string;
  client_name: string;
  crm_stage: string;
  client_phone: string | null;
  updated_at: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

const CLIENT_LIMIT = 200;
const MSG_LOOKBACK = 300;

/**
 * Единый источник списка диалогов юриста — для инбокса (/lawyer/chats) и
 * сайдбара-переключателя в треде (/lawyer/chat/:id).
 *
 * Раньше обе страницы независимо тянули всех клиентов и считали непрочитанные
 * своим запросом по всей таблице lawyer_chat_messages — отсюда расхождения в
 * счётчиках. Теперь:
 *   • непрочитанные берутся из единого ChatPresenceContext (один realtime-канал);
 *   • карточки грузятся ограниченной выборкой (200 свежих по updated_at) с
 *     серверным поиском по имени;
 *   • диалоги с непрочитанными подтягиваются гарантированно, даже если выпали
 *     из выборки (сообщение НЕ бампит lawyer_clients.updated_at, поэтому одной
 *     сортировки по updated_at недостаточно).
 */
export function useLawyerConversations(search: string) {
  const { user } = useAuth();
  const { unreadByConv, totalUnread, onNewMessage } = useChatPresence();
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [debounced, setDebounced] = useState(search);

  // Свежие непрочитанные доступны load() без перевызова (избегаем гонки, когда
  // событие пришло раньше, чем обновился стейт контекста).
  const unreadRef = useRef(unreadByConv);
  unreadRef.current = unreadByConv;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (extraId?: string) => {
    if (!user) { setRows([]); setLoading(false); return; }

    const term = debounced.trim();
    let recentQuery = supabase
      .from("lawyer_clients")
      .select("id, client_name, crm_stage, client_phone, updated_at")
      .eq("lawyer_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(CLIENT_LIMIT);
    if (term) recentQuery = recentQuery.ilike("client_name", `%${term.replace(/[%,]/g, " ")}%`);

    // Гарантируем присутствие диалогов с непрочитанными + только что пришедшего.
    const ensureIds = Array.from(
      new Set([
        ...Object.keys(unreadRef.current).filter((id) => unreadRef.current[id] > 0),
        ...(extraId ? [extraId] : []),
      ]),
    );

    const [recentRes, ensureRes] = await Promise.all([
      recentQuery,
      ensureIds.length
        ? supabase
            .from("lawyer_clients")
            .select("id, client_name, crm_stage, client_phone, updated_at")
            .eq("lawyer_id", user.id)
            .in("id", ensureIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const clientMap = new Map<string, any>();
    [...((recentRes.data as any[]) || []), ...(((ensureRes as any).data as any[]) || [])]
      .forEach((c) => clientMap.set(c.id, c));
    const clients = [...clientMap.values()];
    if (!clients.length) { setRows([]); setLoading(false); return; }

    const ids = clients.map((c) => c.id);
    const { data: messages } = await supabase
      .from("lawyer_chat_messages")
      .select("lawyer_client_id, content, message_type, created_at")
      .in("lawyer_client_id", ids)
      .order("created_at", { ascending: false })
      .limit(MSG_LOOKBACK);

    const lastMap: Record<string, { content: string | null; created_at: string; message_type: string }> = {};
    (messages || []).forEach((m: any) => {
      if (!lastMap[m.lawyer_client_id]) {
        lastMap[m.lawyer_client_id] = { content: m.content, created_at: m.created_at, message_type: m.message_type };
      }
    });

    setRows(
      clients.map((c) => {
        const last = lastMap[c.id];
        return {
          id: c.id,
          client_name: c.client_name,
          crm_stage: c.crm_stage,
          client_phone: c.client_phone,
          updated_at: c.updated_at,
          lastMessage: last ? (last.message_type === "text" ? last.content : "📎 Файл") : null,
          lastMessageAt: last?.created_at || null,
        };
      }),
    );
    setLoading(false);
  }, [user?.id, debounced]);

  // Стабильная ссылка на load — для realtime-подписок, чтобы они не
  // переподписывались на каждый дебаунс поиска.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { load(); }, [load]);

  // Новое входящее сообщение — перезагружаем (передаём id, чтобы гарантированно
  // подтянуть диалог, даже если его карточки нет в свежей выборке).
  useEffect(() => {
    if (!user) return;
    return onNewMessage((e) => loadRef.current(e.lawyerClientId));
  }, [user?.id, onNewMessage]);

  // Realtime по карточкам клиента: само-подключение из каталога, принятый
  // запрос, отвязка, переименование — список диалогов обновляется без релоада.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`lawyer-conv-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `lawyer_id=eq.${user.id}` },
        () => loadRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Непрочитанные подмешиваем здесь — список реагирует на ChatPresenceContext
  // без перезапроса БД (прочитали диалог → бейдж гаснет, карточка опускается).
  const conversations = useMemo<LawyerConversation[]>(() => {
    return rows
      .map((r) => ({ ...r, unread: unreadByConv[r.id] || 0 }))
      .sort((a, b) => {
        if (a.unread > 0 && b.unread === 0) return -1;
        if (a.unread === 0 && b.unread > 0) return 1;
        return (b.lastMessageAt || b.updated_at).localeCompare(a.lastMessageAt || a.updated_at);
      });
  }, [rows, unreadByConv]);

  return { conversations, loading, totalUnread, refresh: load };
}
