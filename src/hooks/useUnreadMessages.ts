import { useChatPresence } from "@/contexts/ChatPresenceContext";

/**
 * Тонкий wrapper над ChatPresenceContext — обратная совместимость со старой
 * сигнатурой { unreadCount, refresh }. Старые компоненты не правим, новые
 * могут читать unreadByConv напрямую через useChatPresence().
 *
 * До рефакторинга этот хук подписывался на ВСЮ таблицу lawyer_chat_messages
 * без фильтра, у КАЖДОГО юзера. Теперь один shared канал с фильтром
 * recipient_id=auth.uid на всё приложение.
 */
export const useUnreadMessages = () => {
  const { totalUnread, refresh } = useChatPresence();
  return { unreadCount: totalUnread, refresh };
};
