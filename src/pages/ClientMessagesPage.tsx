import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { withBrandPath } from "@/lib/brandPath";
import { Briefcase, ChevronRight, Clock, MessageSquare, Search, Ticket } from "lucide-react";

interface Conversation {
  id: string;
  crm_stage: string | null;
  lawyer_id: string;
  updated_at: string;
  lawyerName: string | null;
  lawyerSpec: string | null;
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

const CRM_STAGE_LABELS: Record<string, string> = {
  initial_contact: "Первичный контакт",
  no_diagnosis: "Нет диагноза",
  has_diagnosis: "Есть диагноз",
  examinations: "Обследования",
  diagnosis_confirmed: "Диагноз подтвержден",
  waiting_documents: "Ждем документы",
  documents_received: "Документы получены",
  military_office: "Военкомат",
  regional_commission: "Комиссия субъекта",
  courts: "Суды",
  military_ticket: "Военный билет",
};

const ClientMessagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const brandedPath = useCallback(
    (target: string) => withBrandPath(location.pathname, target),
    [location.pathname],
  );

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: links } = await supabase
      .from("lawyer_clients")
      .select("id, crm_stage, lawyer_id, updated_at")
      .eq("client_user_id", user.id)
      .or("link_state.is.null,link_state.eq.linked_active")
      .order("updated_at", { ascending: false });

    if (!links?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const lawyerIds = [...new Set(links.map((link) => link.lawyer_id))];
    const { data: profiles } = await supabase
      .from("lawyer_profiles")
      .select("user_id, full_name, specialization")
      .in("user_id", lawyerIds);

    const profileMap = new Map<string, { full_name: string | null; specialization: string | null }>();
    (profiles || []).forEach((profile) => profileMap.set(profile.user_id, profile));

    const linkIds = links.map((link) => link.id);
    const [{ data: unreadRows }, { data: lastMsgs }] = await Promise.all([
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id")
        .in("lawyer_client_id", linkIds)
        .neq("sender_id", user.id)
        .eq("is_read", false),
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id, content, message_type, created_at")
        .in("lawyer_client_id", linkIds)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const unreadMap: Record<string, number> = {};
    (unreadRows || []).forEach((row) => {
      unreadMap[row.lawyer_client_id] = (unreadMap[row.lawyer_client_id] || 0) + 1;
    });

    const lastMsgMap: Record<string, { content: string | null; created_at: string; message_type: string }> = {};
    (lastMsgs || []).forEach((message) => {
      if (!lastMsgMap[message.lawyer_client_id]) lastMsgMap[message.lawyer_client_id] = message;
    });

    const nextConversations: Conversation[] = links.map((link) => {
      const profile = profileMap.get(link.lawyer_id);
      const lastMessage = lastMsgMap[link.id];

      return {
        id: link.id,
        crm_stage: link.crm_stage,
        lawyer_id: link.lawyer_id,
        updated_at: link.updated_at,
        lawyerName: profile?.full_name || null,
        lawyerSpec: profile?.specialization || null,
        unread: unreadMap[link.id] || 0,
        lastMessage: lastMessage?.message_type === "text"
          ? lastMessage.content
          : lastMessage ? "Вложение" : null,
        lastMessageAt: lastMessage?.created_at || null,
      };
    });

    nextConversations.sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1;
      if (b.unread > 0 && a.unread === 0) return 1;
      return (b.lastMessageAt || b.updated_at).localeCompare(a.lastMessageAt || a.updated_at);
    });

    setConversations(nextConversations);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`client-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `client_user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_chat_messages", filter: `recipient_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, user]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Сообщения</h1>
            <p className="text-sm text-muted-foreground">Переписка с подключенными юристами</p>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-muted-foreground">Активных переписок пока нет</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Чат появится после подключения юриста: примите запрос, введите код приглашения
                или выберите специалиста в каталоге.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                <Button variant="outline" className="gap-1.5" onClick={() => navigate(brandedPath("/dashboard"))}>
                  <Ticket className="h-4 w-4" />
                  Ввести код
                </Button>
                <Button className="gap-1.5" onClick={() => navigate("/lawyers")}>
                  <Search className="h-4 w-4" />
                  Найти юриста
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => navigate(brandedPath(`/client/chat/${conversation.id}`))}
                className="w-full text-left"
              >
                <Card className={conversation.unread > 0 ? "border-primary/30 bg-primary/5" : "hover:bg-muted/30"}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={
                          `flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center ` +
                          (conversation.unread > 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        <Briefcase className="h-5 w-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">
                            {conversation.lawyerName || "Ваш юрист"}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {conversation.lastMessageAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(conversation.lastMessageAt)}
                              </span>
                            )}
                            {conversation.unread > 0 && (
                              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                {conversation.unread}
                              </span>
                            )}
                          </div>
                        </div>

                        {conversation.lawyerSpec && (
                          <p className="text-xs text-muted-foreground truncate">{conversation.lawyerSpec}</p>
                        )}

                        <div className="flex items-center justify-between mt-1 gap-2">
                          <p
                            className={
                              `text-xs truncate ` +
                              (conversation.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")
                            }
                          >
                            {conversation.lastMessage || "Сообщений пока нет"}
                          </p>
                          {conversation.crm_stage && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                              {CRM_STAGE_LABELS[conversation.crm_stage] || conversation.crm_stage}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 p-4 rounded-xl border bg-muted/30 flex items-start gap-3">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Доступ к документам управляется отдельно от переписки. Вы можете писать юристу,
            а документы и ИИ-анализ открывать или закрывать в кабинете.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ClientMessagesPage;
