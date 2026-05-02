import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Send, Paperclip, Loader2, Download,
  Briefcase, Check, CheckCheck, MessageSquare, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string; sender_id: string; content: string | null;
  message_type: string; file_url: string | null; file_name: string | null;
  file_size: number | null; is_read: boolean; created_at: string;
}

interface ConvEntry {
  id: string; crm_stage: string; lawyer_id: string; updated_at: string;
  lawyerName: string | null; lawyerSpec: string | null; unread: number;
}

const CRM_STAGE_LABELS: Record<string, string> = {
  initial_contact: "Первичный контакт", no_diagnosis: "Нет диагноза",
  has_diagnosis: "Есть диагноз", examinations: "Обследования",
  diagnosis_confirmed: "Диагноз получен", waiting_documents: "Ожидание документов",
  documents_received: "Документы получены", military_office: "Военкомат",
  regional_commission: "Комиссия субъекта", courts: "Суды",
  military_ticket: "Получение ВБ ✓",
};

const ClientChatPage = () => {
  const { lawyerClientId } = useParams<{ lawyerClientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Current conversation ───────────────────────────────────────────────────
  const [conv, setConv] = useState<Record<string, any> | null>(null);
  const [lawyerProfile, setLawyerProfile] = useState<{ full_name: string | null; specialization: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Sidebar (desktop) ─────────────────────────────────────────────────────
  const [allConvs, setAllConvs] = useState<ConvEntry[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    loadSidebar();
    initChat();
  }, [user?.id, lawyerClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSidebar = async () => {
    const { data: links } = await supabase
      .from("lawyer_clients")
      .select("id, crm_stage, lawyer_id, updated_at")
      .eq("client_user_id", user!.id)
      .order("updated_at", { ascending: false });

    if (!links?.length) return;

    const lawyerIds = [...new Set(links.map((l) => l.lawyer_id))];
    const { data: profiles } = await supabase
      .from("lawyer_profiles")
      .select("user_id, full_name, specialization")
      .in("user_id", lawyerIds);
    const profileMap: Record<string, { full_name: string | null; specialization: string | null }> = {};
    (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });

    const linkIds = links.map((l) => l.id);
    const { data: unread } = await supabase
      .from("lawyer_chat_messages")
      .select("lawyer_client_id")
      .in("lawyer_client_id", linkIds)
      .neq("sender_id", user!.id)
      .eq("is_read", false);

    const map: Record<string, number> = {};
    (unread || []).forEach((r) => { map[r.lawyer_client_id] = (map[r.lawyer_client_id] || 0) + 1; });
    setUnreadMap(map);

    setAllConvs(links.map((l) => ({
      id: l.id,
      crm_stage: l.crm_stage,
      lawyer_id: l.lawyer_id,
      updated_at: l.updated_at,
      lawyerName: profileMap[l.lawyer_id]?.full_name || null,
      lawyerSpec: profileMap[l.lawyer_id]?.specialization || null,
      unread: map[l.id] || 0,
    })));
  };

  const initChat = async () => {
    setLoading(true);
    const { data: c } = await supabase
      .from("lawyer_clients")
      .select("*")
      .eq("id", lawyerClientId)
      .eq("client_user_id", user!.id)
      .single();

    if (!c) { navigate("/client/messages"); return; }
    setConv(c);

    const { data: profile } = await supabase
      .from("lawyer_profiles")
      .select("full_name, specialization")
      .eq("user_id", c.lawyer_id)
      .maybeSingle();
    setLawyerProfile(profile);

    await loadMessages();
    setLoading(false);
    subscribeRealtime();

    await supabase.from("lawyer_chat_messages")
      .update({ is_read: true })
      .eq("lawyer_client_id", lawyerClientId)
      .neq("sender_id", user!.id);
    setUnreadMap((prev) => ({ ...prev, [lawyerClientId!]: 0 }));
  };

  const loadMessages = async () => {
    const { data } = await supabase
      .from("lawyer_chat_messages")
      .select("*")
      .eq("lawyer_client_id", lawyerClientId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  };

  const subscribeRealtime = () => {
    const channel = supabase.channel(`client-chat:${lawyerClientId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "lawyer_chat_messages",
        filter: `lawyer_client_id=eq.${lawyerClientId}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        });
        if ((payload.new as Message).sender_id !== user!.id) {
          supabase.from("lawyer_chat_messages").update({ is_read: true }).eq("id", (payload.new as Message).id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const sendMessage = async (content: string, type = "text", fileUrl?: string, fileName?: string, fileSize?: number) => {
    setSending(true);
    const { error } = await supabase.from("lawyer_chat_messages").insert({
      lawyer_client_id: lawyerClientId, sender_id: user!.id,
      content: content || null, message_type: type,
      file_url: fileUrl || null, file_name: fileName || null, file_size: fileSize || null,
    });
    if (error) toast({ title: "Ошибка отправки", description: error.message, variant: "destructive" });
    setSending(false);
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim(); setText("");
    await sendMessage(t);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Файл больше 10 МБ", variant: "destructive" }); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `chat/${lawyerClientId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Ошибка загрузки", description: error.message, variant: "destructive" });
      setUploading(false); return;
    }
    const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(data.path);
    await sendMessage(file.name, file.type.startsWith("image/") ? "image" : "file", publicUrl, file.name, file.size);
    setUploading(false);
    e.target.value = "";
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const grouped: { date: string; msgs: Message[] }[] = [];
  messages.forEach((m) => {
    const d = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) grouped.push({ date: d, msgs: [m] });
    else last.msgs.push(m);
  });

  if (loading) return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Header />
      <div className="flex-1 container mx-auto px-4 py-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-3/4" style={{ marginLeft: i % 2 ? "auto" : 0 }} />
        ))}
      </div>
    </div>
  );

  const lawyerName = lawyerProfile?.full_name || "Ваш юрист";
  const stageLabel = CRM_STAGE_LABELS[conv?.crm_stage] || "";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Header />

      <div className="flex-1 min-h-0 flex">
        {/* ── Sidebar (desktop) ──────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 xl:w-80 border-r bg-card/30 flex-shrink-0">
          <div className="px-3 py-3 border-b flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
              onClick={() => navigate("/client/messages")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm truncate">Сообщения</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {allConvs.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/client/chat/${c.id}`)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-muted group",
                  lawyerClientId === c.id ? "bg-primary/10 border border-primary/20" : ""
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                    lawyerClientId === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn(
                        "font-medium text-sm truncate",
                        lawyerClientId === c.id ? "text-primary" : ""
                      )}>
                        {c.lawyerName || "Юрист"}
                      </p>
                      {(unreadMap[c.id] || 0) > 0 && (
                        <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {unreadMap[c.id]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {CRM_STAGE_LABELS[c.crm_stage] || c.crm_stage}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Chat area ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Chat top bar */}
          <div className="border-b bg-card px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden flex-shrink-0"
              onClick={() => navigate("/client/messages")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{lawyerName}</p>
              <div className="flex items-center gap-2">
                {stageLabel && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                    {stageLabel}
                  </Badge>
                )}
                {lawyerProfile?.specialization && (
                  <span className="text-xs text-muted-foreground truncate hidden sm:block">
                    {lawyerProfile.specialization}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 sm:px-4 py-4 max-w-3xl mx-auto space-y-1">
              {messages.length === 0 && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  Нет сообщений. Юрист напишет вам здесь.
                </div>
              )}
              {grouped.map(({ date, msgs }) => (
                <div key={date}>
                  <div className="flex justify-center my-4">
                    <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">{date}</span>
                  </div>
                  {msgs.map((m) => {
                    const isOwn = m.sender_id === user!.id;
                    return (
                      <div key={m.id} className={cn("flex mb-1.5", isOwn ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm",
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card border rounded-bl-sm"
                        )}>
                          {m.message_type === "image" && m.file_url && (
                            <div className="mb-2">
                              <img src={m.file_url} alt={m.file_name || "Изображение"}
                                className="max-w-full rounded-lg max-h-48 object-cover" />
                            </div>
                          )}
                          {m.message_type === "file" && m.file_url && (
                            <a href={m.file_url} target="_blank" rel="noopener noreferrer"
                              className={cn(
                                "flex items-center gap-2 text-sm hover:underline",
                                isOwn ? "text-primary-foreground" : "text-primary"
                              )}>
                              <Download className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{m.file_name || "Файл"}</span>
                              {m.file_size && (
                                <span className="text-xs opacity-70">({Math.round(m.file_size / 1024)} КБ)</span>
                              )}
                            </a>
                          )}
                          {m.message_type === "text" && m.content && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                          )}
                          {m.message_type !== "text" && m.content && m.content !== m.file_name && (
                            <p className="text-sm mt-1">{m.content}</p>
                          )}
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1",
                            isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}>
                            <span className="text-[11px]">{formatTime(m.created_at)}</span>
                            {isOwn && (m.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t bg-background px-3 sm:px-4 py-3 flex-shrink-0">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <input type="file" ref={fileRef} onChange={handleFile} className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
              <Button variant="ghost" size="icon" className="flex-shrink-0 h-10 w-10"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Написать сообщение..."
                className="flex-1"
                disabled={sending}
              />
              <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}
                className="flex-shrink-0 h-10 w-10">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientChatPage;
