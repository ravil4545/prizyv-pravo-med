import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Paperclip, Loader2, Download, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string; sender_id: string; content: string | null;
  message_type: string; file_url: string | null; file_name: string | null;
  file_size: number | null; is_read: boolean; created_at: string;
}

const LawyerChatPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [client, setClient] = useState<Record<string, any> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isLawyer) { navigate("/dashboard"); return; }
    init();
  }, [user, profileLoading, isLawyer, clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const init = async () => {
    const { data: c } = await supabase.from("lawyer_clients").select("*").eq("id", clientId).eq("lawyer_id", user!.id).single();
    if (!c) { navigate("/lawyer/clients"); return; }
    setClient(c);
    await loadMessages();
    setLoading(false);
    subscribeRealtime();
    // Mark messages as read
    await supabase.from("chat_messages").update({ is_read: true })
      .eq("lawyer_client_id", clientId).neq("sender_id", user!.id);
  };

  const loadMessages = async () => {
    const { data } = await supabase.from("chat_messages")
      .select("*").eq("lawyer_client_id", clientId).order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  };

  const subscribeRealtime = () => {
    const channel = supabase.channel(`chat:${clientId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "chat_messages",
        filter: `lawyer_client_id=eq.${clientId}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        });
        if ((payload.new as Message).sender_id !== user!.id) {
          supabase.from("chat_messages").update({ is_read: true }).eq("id", (payload.new as Message).id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const sendMessage = async (content: string, type = "text", fileUrl?: string, fileName?: string, fileSize?: number) => {
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      lawyer_client_id: clientId, sender_id: user!.id,
      content: content || null, message_type: type,
      file_url: fileUrl || null, file_name: fileName || null, file_size: fileSize || null,
    });
    if (error) toast({ title: "Ошибка отправки", variant: "destructive" });
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
    const path = `chat/${clientId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Ошибка загрузки файла", description: error.message, variant: "destructive" });
      setUploading(false); return;
    }
    const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(data.path);
    const type = file.type.startsWith("image/") ? "image" : "file";
    await sendMessage(file.name, type, publicUrl, file.name, file.size);
    setUploading(false);
    e.target.value = "";
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  messages.forEach((m) => {
    const d = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) grouped.push({ date: d, msgs: [m] });
    else last.msgs.push(m);
  });

  if (loading || profileLoading) return (
    <div className="min-h-screen bg-background flex flex-col"><Header />
      <div className="flex-1 container mx-auto px-4 py-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/4" style={{ marginLeft: i % 2 ? "auto" : 0 }} />)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      {/* Chat header */}
      <div className="border-b bg-card sticky top-[57px] z-40">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/lawyer/clients/${clientId}`)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{client?.client_name}</p>
            <p className="text-xs text-muted-foreground">{client?.client_phone || "Телефон не указан"}</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/lawyer/clients/${clientId}`}>Дело</Link>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Нет сообщений. Начните переписку.
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
                  <div key={m.id} className={cn("flex mb-2", isOwn ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[75%] rounded-2xl px-4 py-2 shadow-sm",
                      isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm")}>
                      {m.message_type === "image" && m.file_url && (
                        <div className="mb-2">
                          <img src={m.file_url} alt={m.file_name || "Изображение"} className="max-w-full rounded-lg max-h-48 object-cover" />
                        </div>
                      )}
                      {m.message_type === "file" && m.file_url && (
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer"
                          className={cn("flex items-center gap-2 text-sm hover:underline", isOwn ? "text-primary-foreground" : "text-primary")}>
                          <Download className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{m.file_name || "Файл"}</span>
                          {m.file_size && <span className="text-xs opacity-70">({Math.round(m.file_size / 1024)} КБ)</span>}
                        </a>
                      )}
                      {m.content && m.message_type === "text" && <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>}
                      {m.message_type !== "text" && m.content && m.content !== m.file_name && (
                        <p className="text-sm mt-1">{m.content}</p>
                      )}
                      <p className={cn("text-xs mt-1", isOwn ? "text-primary-foreground/70 text-right" : "text-muted-foreground")}>
                        {formatTime(m.created_at)}{isOwn && (m.is_read ? " ✓✓" : " ✓")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-background sticky bottom-0 pb-safe">
        <div className="container mx-auto px-4 py-3 max-w-3xl">
          <div className="flex items-end gap-2">
            <input type="file" ref={fileRef} onChange={handleFile} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-10 w-10" onClick={() => fileRef.current?.click()} disabled={uploading}>
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
            <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending} className="flex-shrink-0 h-10 w-10">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LawyerChatPage;
