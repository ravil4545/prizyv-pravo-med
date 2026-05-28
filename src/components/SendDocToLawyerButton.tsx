import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Send, Loader2, Briefcase } from "lucide-react";
import { getSignedDocumentUrl, uploadChatAttachment } from "@/lib/storage";

/**
 * Мост «документ из досье → чат юристу».
 *
 * Клиент уже загрузил и проанализировал документ в своём досье. Эта кнопка
 * позволяет отправить его в чат конкретному юристу без повторной загрузки:
 * файл копируется в bucket чата (chat-attachments) и постится как вложение.
 *
 * Поведение:
 *   • нет связанных юристов → кнопка не отображается;
 *   • один юрист → один клик отправляет;
 *   • несколько → выпадающий список с выбором.
 */

interface DocLike {
  id: string;
  title: string | null;
  file_url: string;
}

interface LawyerConv {
  id: string;             // lawyer_clients.id (= lawyer_client_id чата)
  lawyer_id: string;
  lawyerName: string | null;
}

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "heic"];

const SendDocToLawyerButton = ({ doc }: { doc: DocLike }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [convs, setConvs] = useState<LawyerConv[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from("lawyer_clients")
        .select("id, lawyer_id, link_state")
        .eq("client_user_id", user.id);
      const active = (links || []).filter(
        (l: any) => !["archived", "declined", "unlinked", "unlinked_by_client", "unlinked_by_lawyer"].includes(l.link_state),
      );
      if (active.length === 0) { if (!cancelled) setConvs([]); return; }
      const ids = [...new Set(active.map((l: any) => l.lawyer_id))];
      const { data: profs } = await supabase
        .from("lawyer_profiles").select("user_id, full_name").in("user_id", ids);
      const nameMap: Record<string, string | null> = {};
      (profs || []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });
      if (!cancelled) {
        setConvs(active.map((l: any) => ({ id: l.id, lawyer_id: l.lawyer_id, lawyerName: nameMap[l.lawyer_id] || null })));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const sendTo = async (conv: LawyerConv) => {
    if (sending) return;
    setSending(true);
    try {
      // 1. Подписанная ссылка на документ из медкарт → скачиваем содержимое
      const signed = await getSignedDocumentUrl(doc.file_url);
      if (!signed) throw new Error("Не удалось получить файл документа");
      const blob = await (await fetch(signed)).blob();
      if (blob.size > 10 * 1024 * 1024) throw new Error("Файл больше 10 МБ");

      // 2. Заливаем копию в bucket чата
      const ext = (doc.file_url.split(".").pop() || "bin").toLowerCase().split("?")[0];
      const path = `chat/${conv.id}/${Date.now()}.${ext}`;
      const storedPath = await uploadChatAttachment(path, blob, blob.type || undefined);

      // 3. Постим как вложение в чат
      const isImage = IMAGE_EXT.includes(ext) || blob.type.startsWith("image/");
      const fileName = `${doc.title || "Документ"}.${ext}`;
      const { error } = await supabase.from("lawyer_chat_messages").insert({
        lawyer_client_id: conv.id,
        sender_id: user!.id,
        content: doc.title || "Документ из досье",
        message_type: isImage ? "image" : "file",
        file_url: storedPath,
        file_name: fileName,
        file_size: blob.size,
      });
      if (error) throw error;

      toast({
        title: "Документ отправлен юристу",
        description: conv.lawyerName ? `«${doc.title || "Документ"}» → ${conv.lawyerName}` : undefined,
      });
    } catch (e: any) {
      toast({ title: "Не удалось отправить", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (convs.length === 0) return null;

  // Один юрист — прямая отправка
  if (convs.length === 1) {
    return (
      <Button
        variant="ghost" size="icon" className="h-9 w-9"
        onClick={() => sendTo(convs[0])} disabled={sending}
        title="Отправить юристу в чат"
      >
        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 text-primary" />}
      </Button>
    );
  }

  // Несколько — выбор юриста
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" disabled={sending} title="Отправить юристу в чат">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 text-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Отправить документ юристу</DropdownMenuLabel>
        {convs.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => sendTo(c)}>
            <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
            {c.lawyerName || "Юрист"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SendDocToLawyerButton;
