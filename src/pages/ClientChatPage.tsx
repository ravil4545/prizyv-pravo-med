import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CRM_STAGE_LABELS } from "@/lib/crmStages";
import {
  ArrowLeft, Send, Paperclip, Loader2, Download,
  Briefcase, Check, CheckCheck, MessageSquare, ChevronRight, Image as ImageIcon, Pencil, X,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeChatMessage, describeDetected } from "@/lib/chatSanitizer";
import { uploadChatAttachment, getSignedChatAttachmentUrl } from "@/lib/storage";

interface Message {
  id: string; sender_id: string; content: string | null;
  message_type: string; file_url: string | null; file_name: string | null;
  file_size: number | null; is_read: boolean; created_at: string;
  edited_at?: string | null;
}

interface ConvEntry {
  id: string; crm_stage: string; lawyer_id: string; updated_at: string;
  lawyerName: string | null; unread: number;
}

// Подписи этапов — единый источник: CRM_STAGE_LABELS из @/lib/crmStages.

const ClientChatPage = () => {
  const { lawyerClientId } = useParams<{ lawyerClientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [conv, setConv] = useState<Record<string, any> | null>(null);
  const [lawyerProfile, setLawyerProfile] = useState<{ full_name: string | null; specialization: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const [allConvs, setAllConvs] = useState<ConvEntry[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  // Доступ юриста к документам/профилю/ИИ. null = ещё не загрузили.
  const [accessActive, setAccessActive] = useState<boolean | null>(null);
  const [grantingAccess, setGrantingAccess] = useState(false);
  // messageId → подписанная ссылка на вложение (bucket приватный).
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    loadSidebar();
    initChat();
  }, [user?.id, lawyerClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (!user || !lawyerClientId) return;
    const channel = supabase
      .channel(`client-chat:${lawyerClientId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "lawyer_chat_messages",
        filter: `lawyer_client_id=eq.${lawyerClientId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        resolveAttachments([msg]);
        if (msg.sender_id !== user!.id) {
          supabase.from("lawyer_chat_messages").update({ is_read: true }).eq("id", msg.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "lawyer_chat_messages",
        filter: `lawyer_client_id=eq.${lawyerClientId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, lawyerClientId]);

  const loadSidebar = async () => {
    const { data: links } = await supabase
      .from("lawyer_clients")
      .select("id, crm_stage, lawyer_id, updated_at")
      .eq("client_user_id", user!.id)
      .order("updated_at", { ascending: false });
    if (!links?.length) return;

    const lawyerIds = [...new Set(links.map((l) => l.lawyer_id))];
    const { data: profiles } = await supabase
      .from("lawyer_profiles").select("user_id, full_name").in("user_id", lawyerIds);
    const profileMap: Record<string, string | null> = {};
    (profiles || []).forEach((p) => { profileMap[p.user_id] = p.full_name; });

    const linkIds = links.map((l) => l.id);
    const { data: unread } = await supabase
      .from("lawyer_chat_messages").select("lawyer_client_id")
      .in("lawyer_client_id", linkIds).neq("sender_id", user!.id).eq("is_read", false);

    const map: Record<string, number> = {};
    (unread || []).forEach((r) => { map[r.lawyer_client_id] = (map[r.lawyer_client_id] || 0) + 1; });
    setUnreadMap(map);
    setAllConvs(links.map((l) => ({
      id: l.id, crm_stage: l.crm_stage, lawyer_id: l.lawyer_id, updated_at: l.updated_at,
      lawyerName: profileMap[l.lawyer_id] || null, unread: map[l.id] || 0,
    })));
  };

  // Подписываем ссылки на вложения (bucket приватный) — по одной на сообщение.
  const resolveAttachments = async (msgs: Message[]) => {
    const targets = msgs.filter((m) => m.file_url && (m.message_type === "image" || m.message_type === "file"));
    if (targets.length === 0) return;
    const entries = await Promise.all(
      targets.map(async (m) => [m.id, await getSignedChatAttachmentUrl(m.file_url!)] as const),
    );
    setAttachmentUrls((prev) => {
      const next = { ...prev };
      for (const [id, url] of entries) if (url) next[id] = url;
      return next;
    });
  };

  const initChat = async () => {
    setLoading(true);
    const { data: c } = await supabase
      .from("lawyer_clients").select("*")
      .eq("id", lawyerClientId).eq("client_user_id", user!.id).single();
    if (!c) { navigate("/client/messages"); return; }
    setConv(c);

    const { data: profile } = await supabase
      .from("lawyer_profiles").select("full_name, specialization")
      .eq("user_id", c.lawyer_id).maybeSingle();
    setLawyerProfile(profile);

    // Открыт ли юристу доступ к документам/профилю/ИИ
    const { data: access } = await supabase
      .from("client_document_access").select("is_active")
      .eq("client_user_id", user!.id).eq("lawyer_id", c.lawyer_id).maybeSingle();
    setAccessActive(!!access?.is_active);

    const { data: msgs } = await supabase
      .from("lawyer_chat_messages").select("*")
      .eq("lawyer_client_id", lawyerClientId).order("created_at", { ascending: true });
    const list = (msgs as Message[]) || [];
    setMessages(list);
    resolveAttachments(list);
    setLoading(false);

    await supabase.from("lawyer_chat_messages")
      .update({ is_read: true }).eq("lawyer_client_id", lawyerClientId).neq("sender_id", user!.id);
    setUnreadMap((prev) => ({ ...prev, [lawyerClientId!]: 0 }));
  };

  // Открыть юристу доступ к документам прямо из чата (одна кнопка).
  const grantAccess = async () => {
    if (!conv?.lawyer_id || grantingAccess) return;
    setGrantingAccess(true);
    const { error } = await supabase
      .from("client_document_access")
      .upsert(
        { client_user_id: user!.id, lawyer_id: conv.lawyer_id, is_active: true },
        { onConflict: "client_user_id,lawyer_id" },
      );
    setGrantingAccess(false);
    if (error) {
      toast({ title: "Не удалось открыть доступ", description: error.message, variant: "destructive" });
      return;
    }
    setAccessActive(true);
    toast({
      title: "Доступ открыт",
      description: "Юрист теперь видит ваши документы, профиль и ИИ-расшифровки. Отозвать можно в кабинете.",
    });
  };

  const sendMessage = async (content: string, type = "text", fileUrl?: string, fileName?: string, fileSize?: number) => {
    setSending(true);

    // Защита: блокируем обмен внешними контактами в чате до подписания договора
    let safeContent = content;
    if (content && type === "text") {
      const check = sanitizeChatMessage(content);
      if (check.hasReplacements) {
        safeContent = check.sanitized;
        toast({
          title: "Контакты скрыты",
          description: `Мы скрыли ${describeDetected(check.detected)} в вашем сообщении. До договора общение только в чате сайта.`,
        });
      }
    }

    const { data, error } = await supabase.from("lawyer_chat_messages").insert({
      lawyer_client_id: lawyerClientId, sender_id: user!.id,
      content: safeContent || null, message_type: type,
      file_url: fileUrl || null, file_name: fileName || null, file_size: fileSize || null,
    }).select().single();
    if (error) {
      toast({ title: "Ошибка отправки", description: error.message, variant: "destructive" });
    } else if (data) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === (data as Message).id)) return prev;
        return [...prev, data as Message];
      });
      resolveAttachments([data as Message]);
    }
    setSending(false);
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim(); setText("");
    if (textareaRef.current) { textareaRef.current.style.height = "40px"; }
    await sendMessage(t);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Файл больше 10 МБ", variant: "destructive" }); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `chat/${lawyerClientId}/${Date.now()}.${ext}`;
    try {
      // Храним storage-путь (bucket приватный); ссылку подписываем при показе.
      const storedPath = await uploadChatAttachment(path, file, file.type);
      await sendMessage(file.name, file.type.startsWith("image/") ? "image" : "file", storedPath, file.name, file.size);
    } catch (err: any) {
      toast({ title: "Ошибка загрузки", description: err?.message, variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingId) return;
    const { error } = await supabase.from("lawyer_chat_messages")
      .update({ content: editText.trim(), edited_at: new Date().toISOString() })
      .eq("id", editingId).eq("sender_id", user!.id);
    if (error) { toast({ title: "Ошибка редактирования", variant: "destructive" }); return; }
    setMessages((prev) => prev.map((m) =>
      m.id === editingId ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m
    ));
    setEditingId(null);
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

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Header />

      <div className="flex-1 min-h-0 p-0 lg:p-3">
        <div className="h-full flex overflow-hidden lg:rounded-xl lg:border lg:shadow-md bg-background lg:bg-card/50">

          {/* ── Sidebar (desktop) ──────────────────────────────────────────── */}
          <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r bg-card/30 flex-shrink-0">
            <div className="px-3 py-3 border-b flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
                onClick={() => navigate("/client/messages")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm">Переписка</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {allConvs.map((c) => (
                <button key={c.id} onClick={() => navigate(`/client/chat/${c.id}`)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-muted",
                    lawyerClientId === c.id ? "bg-primary/10 border border-primary/20" : ""
                  )}>
                  <div className="flex items-center gap-2">
                    <div className={cn("flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                      lawyerClientId === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Briefcase className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn("font-medium text-sm truncate", lawyerClientId === c.id ? "text-primary" : "")}>
                          {c.lawyerName || "Юрист"}
                        </p>
                        {(unreadMap[c.id] || 0) > 0 && (
                          <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unreadMap[c.id]}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* ── Chat area ────────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Top bar */}
            <div className="border-b bg-card/80 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden flex-shrink-0"
                onClick={() => navigate("/client/messages")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{lawyerName}</p>
                {conv?.crm_stage && CRM_STAGE_LABELS[conv.crm_stage] ? (
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                    Этап дела: {CRM_STAGE_LABELS[conv.crm_stage]}
                  </p>
                ) : lawyerProfile?.specialization ? (
                  <p className="text-xs text-muted-foreground truncate">{lawyerProfile.specialization}</p>
                ) : null}
              </div>
            </div>

            {/* Баннер доступа: связь есть, но юрист не видит документы/ИИ */}
            {accessActive === false && (
              <div className="border-b bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 flex items-center gap-2.5 flex-shrink-0">
                <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-900 dark:text-amber-200 flex-1 leading-snug">
                  Юрист пока <strong>не видит</strong> ваши документы, профиль и ИИ-расшифровки — он не сможет полноценно помочь.
                </p>
                <Button size="sm" className="h-7 gap-1.5 flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={grantAccess} disabled={grantingAccess}>
                  {grantingAccess ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Открыть доступ
                </Button>
              </div>
            )}
            {accessActive === true && (
              <div className="border-b bg-emerald-50/60 dark:bg-emerald-950/10 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 flex-1 leading-snug">
                  Юрист видит ваши документы и ИИ-анализ. Отозвать доступ можно в кабинете.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-3 max-w-3xl mx-auto space-y-0.5">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Нет сообщений. Юрист напишет вам здесь.
                  </div>
                )}
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
                    <div className="flex justify-center my-3">
                      <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">{date}</span>
                    </div>
                    {msgs.map((m) => {
                      const isOwn = m.sender_id === user!.id;
                      const fileSrc = attachmentUrls[m.id];
                      if (m.message_type === "system") {
                        return (
                          <div key={m.id} className="flex justify-center my-2">
                            <span className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-3 py-1 max-w-[85%] text-center">
                              {m.content}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={m.id} className={cn("flex mb-1 items-end gap-1 group", isOwn ? "flex-row-reverse" : "")}>
                          {/* Edit button for own text messages */}
                          {isOwn && m.message_type === "text" && editingId !== m.id && (
                            <Button variant="ghost" size="icon"
                              className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 mb-1"
                              onClick={() => { setEditingId(m.id); setEditText(m.content || ""); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <div className={cn(
                            "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm",
                            isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"
                          )}>
                            {editingId === m.id ? (
                              <div>
                                <textarea
                                  ref={editRef}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  className="w-full text-sm bg-primary-foreground/10 text-primary-foreground rounded-lg px-2 py-1 resize-none border border-primary-foreground/20 focus:outline-none min-w-[180px]"
                                  rows={2}
                                />
                                <div className="flex gap-1 mt-1.5 justify-end">
                                  <button onClick={() => setEditingId(null)}
                                    className="text-[10px] text-primary-foreground/70 hover:text-primary-foreground px-2 py-0.5 rounded">
                                    Отмена
                                  </button>
                                  <button onClick={saveEdit}
                                    className="text-[10px] bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground px-2 py-0.5 rounded">
                                    Сохранить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {m.message_type === "image" && m.file_url && (
                                  <div className="mb-1.5">
                                    {fileSrc ? (
                                      <img src={fileSrc} alt={m.file_name || "Фото"}
                                        className="max-w-full rounded-lg max-h-52 object-cover cursor-pointer"
                                        onClick={() => window.open(fileSrc, "_blank")} />
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs opacity-70 py-4">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка фото…
                                      </div>
                                    )}
                                  </div>
                                )}
                                {m.message_type === "file" && m.file_url && (
                                  fileSrc ? (
                                    <a href={fileSrc} target="_blank" rel="noopener noreferrer"
                                      className={cn("flex items-center gap-2 text-sm hover:underline",
                                        isOwn ? "text-primary-foreground" : "text-primary")}>
                                      <Download className="h-4 w-4 flex-shrink-0" />
                                      <span className="truncate">{m.file_name || "Файл"}</span>
                                      {m.file_size && <span className="text-xs opacity-70">({Math.round(m.file_size / 1024)} КБ)</span>}
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-2 text-sm opacity-70">
                                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                      <span className="truncate">{m.file_name || "Файл"}</span>
                                    </div>
                                  )
                                )}
                                {m.message_type === "text" && m.content && (
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                )}
                                {m.message_type !== "text" && m.content && m.content !== m.file_name && (
                                  <p className="text-sm mt-1">{m.content}</p>
                                )}
                              </>
                            )}
                            <div className={cn("flex items-center justify-end gap-1 mt-0.5",
                              isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
                              {m.edited_at && <span className="text-[10px] opacity-60">изм.</span>}
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
            <div className="border-t bg-card/80 px-3 py-2.5 flex-shrink-0">
              <div className="max-w-3xl mx-auto flex items-end gap-1.5">
                <input type="file" ref={imageRef} onChange={handleFile} className="hidden" accept="image/*" />
                <input type="file" ref={fileRef} onChange={handleFile} className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" />
                <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0"
                  onClick={() => imageRef.current?.click()} disabled={uploading} title="Отправить фото">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0"
                  onClick={() => fileRef.current?.click()} disabled={uploading} title="Прикрепить файл">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                  onKeyDown={handleKeyDown}
                  placeholder="Написать сообщение..."
                  rows={1}
                  disabled={sending}
                  className="flex-1 resize-none overflow-hidden bg-background border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground disabled:opacity-50 leading-relaxed"
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                />
                <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}
                  className="h-9 w-9 flex-shrink-0 rounded-xl">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientChatPage;
