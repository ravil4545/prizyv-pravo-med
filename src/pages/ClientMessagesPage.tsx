import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, ChevronRight, Clock, Briefcase } from "lucide-react";

interface Conversation {
  id: string;
  crm_stage: string;
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
  diagnosis_confirmed: "Диагноз получен",
  waiting_documents: "Ожидание документов",
  documents_received: "Документы получены",
  military_office: "Военкомат",
  regional_commission: "Комиссия субъекта",
  courts: "Суды",
  military_ticket: "Получение ВБ ✓",
};

const ClientMessagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user?.id]);

  const load = async () => {
    const { data: links } = await supabase
      .from("lawyer_clients")
      .select("id, crm_stage, lawyer_id, updated_at")
      .eq("client_user_id", user!.id)
      .order("updated_at", { ascending: false });

    if (!links?.length) { setLoading(false); return; }

    const lawyerIds = [...new Set(links.map((l) => l.lawyer_id))];

    // Load lawyer profiles (may fail if no connected profile — that's ok)
    const { data: profiles } = await supabase
      .from("lawyer_profiles")
      .select("user_id, full_name, specialization")
      .in("user_id", lawyerIds);

    const profileMap: Record<string, { full_name: string | null; specialization: string | null }> = {};
    (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });

    const linkIds = links.map((l) => l.id);

    const [{ data: unreadRows }, { data: lastMsgs }] = await Promise.all([
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id")
        .in("lawyer_client_id", linkIds)
        .neq("sender_id", user!.id)
        .eq("is_read", false),
      supabase
        .from("lawyer_chat_messages")
        .select("lawyer_client_id, content, message_type, created_at")
        .in("lawyer_client_id", linkIds)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const unreadMap: Record<string, number> = {};
    (unreadRows || []).forEach((r) => {
      unreadMap[r.lawyer_client_id] = (unreadMap[r.lawyer_client_id] || 0) + 1;
    });

    const lastMsgMap: Record<string, { content: string | null; created_at: string; message_type: string }> = {};
    (lastMsgs || []).forEach((m) => {
      if (!lastMsgMap[m.lawyer_client_id]) lastMsgMap[m.lawyer_client_id] = m;
    });

    const convs: Conversation[] = links.map((l) => ({
      id: l.id,
      crm_stage: l.crm_stage,
      lawyer_id: l.lawyer_id,
      updated_at: l.updated_at,
      lawyerName: profileMap[l.lawyer_id]?.full_name || null,
      lawyerSpec: profileMap[l.lawyer_id]?.specialization || null,
      unread: unreadMap[l.id] || 0,
      lastMessage: lastMsgMap[l.id]?.message_type === "text"
        ? lastMsgMap[l.id]?.content
        : lastMsgMap[l.id] ? "📎 Файл" : null,
      lastMessageAt: lastMsgMap[l.id]?.created_at || null,
    }));

    // Sort: unread first, then by lastMessageAt
    convs.sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1;
      if (b.unread > 0 && a.unread === 0) return 1;
      return (b.lastMessageAt || b.updated_at).localeCompare(a.lastMessageAt || a.updated_at);
    });

    setConversations(convs);
    setLoading(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Сообщения</h1>
            <p className="text-sm text-muted-foreground">Переписка с вашим юристом</p>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-muted-foreground">Нет активных переписок</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                Когда юрист добавит вас в свою систему и свяжет с вашим аккаунтом, здесь появится переписка.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => navigate("/dashboard")}>
                В личный кабинет
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/client/chat/${conv.id}`)}
                className="w-full text-left"
              >
                <Card className={conv.unread > 0 ? "border-primary/30 bg-primary/3" : "hover:bg-muted/30"}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={
                        `flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center ` +
                        (conv.unread > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                      }>
                        <Briefcase className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">
                            {conv.lawyerName || "Ваш юрист"}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {conv.lastMessageAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(conv.lastMessageAt)}
                              </span>
                            )}
                            {conv.unread > 0 && (
                              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                {conv.unread}
                              </span>
                            )}
                          </div>
                        </div>
                        {conv.lawyerSpec && (
                          <p className="text-xs text-muted-foreground truncate">{conv.lawyerSpec}</p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <p className={
                            `text-xs truncate ` +
                            (conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")
                          }>
                            {conv.lastMessage || "Нет сообщений"}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {CRM_STAGE_LABELS[conv.crm_stage] || conv.crm_stage}
                            </Badge>
                          </div>
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
            Чат появится здесь, как только вы подтвердите запрос от юриста в личном кабинете
            (или введёте код приглашения от него в блоке «У меня есть код от юриста»).
            Доступ к документам и ИИ-анализам открывается одной кнопкой — и так же закрывается.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ClientMessagesPage;
