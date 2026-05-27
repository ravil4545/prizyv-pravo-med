import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MessageSquare, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_STAGE_LABELS } from "@/lib/crmStages";
import { useChatPresence } from "@/contexts/ChatPresenceContext";

interface ChatEntry {
  id: string;
  client_name: string;
  crm_stage: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins} мин`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ч`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

const LawyerChatsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadChats = useCallback(async () => {
    if (!user) return;
    const { data: clients } = await supabase
      .from("lawyer_clients")
      .select("id, client_name, crm_stage")
      .eq("lawyer_id", user.id);

    if (!clients?.length) { setLoading(false); return; }

    const clientIds = clients.map((c) => c.id);

    const [{ data: messages }, { data: unreadRows }] = await Promise.all([
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id, content, created_at")
        .in("lawyer_client_id", clientIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id")
        .in("lawyer_client_id", clientIds)
        .neq("sender_id", user.id)
        .eq("is_read", false),
    ]);

    const lastMsgMap: Record<string, { content: string; created_at: string }> = {};
    messages?.forEach((m) => {
      if (!lastMsgMap[m.lawyer_client_id]) {
        lastMsgMap[m.lawyer_client_id] = { content: m.content, created_at: m.created_at };
      }
    });

    const unreadMap: Record<string, number> = {};
    unreadRows?.forEach((r) => {
      unreadMap[r.lawyer_client_id] = (unreadMap[r.lawyer_client_id] || 0) + 1;
    });

    const result: ChatEntry[] = clients.map((c) => ({
      id: c.id,
      client_name: c.client_name,
      crm_stage: c.crm_stage,
      lastMessage: lastMsgMap[c.id]?.content || null,
      lastMessageAt: lastMsgMap[c.id]?.created_at || null,
      unreadCount: unreadMap[c.id] || 0,
    }));

    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return 0;
    });

    setEntries(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    loadChats();
  }, [user, profileLoading, isLawyer, loadChats]);

  // Подписка теперь идёт через shared ChatPresenceContext — один канал
  // фильтруется по recipient_id=auth.uid на всю сессию. На любое новое
  // сообщение, адресованное мне, перезагружаем список диалогов.
  const { onNewMessage } = useChatPresence();
  useEffect(() => {
    if (!user) return;
    return onNewMessage(() => loadChats());
  }, [user?.id, loadChats, onNewMessage]);

  const filtered = entries.filter(
    (e) => !search || e.client_name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalUnread = entries.reduce((s, e) => s + e.unreadCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/lawyer"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Чаты</h1>
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {totalUnread} новых
            </span>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по клиенту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full mb-1 rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{search ? "Клиент не найден" : "Нет диалогов"}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((e) => (
              <div
                key={e.id}
                onClick={() => navigate(`/lawyer/chat/${e.id}`)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors",
                  e.unreadCount > 0 ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted",
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-base uppercase",
                    e.unreadCount > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.client_name[0]}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className={cn("font-semibold text-sm truncate", e.unreadCount > 0 && "text-primary")}>
                      {e.client_name}
                    </p>
                    {e.lastMessageAt && (
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {formatTime(e.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5 gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {e.lastMessage
                        ? e.lastMessage.length > 55
                          ? e.lastMessage.slice(0, 55) + "…"
                          : e.lastMessage
                        : <span className="italic">{CRM_STAGE_LABELS[e.crm_stage] || e.crm_stage}</span>}
                    </p>
                    {e.unreadCount > 0 && (
                      <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {e.unreadCount > 99 ? "99+" : e.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default LawyerChatsPage;
