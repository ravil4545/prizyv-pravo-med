import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useUnreadMessages = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = async () => {
    if (!user) { setUnreadCount(0); return; }

    const [{ data: asLawyer }, { data: asClient }] = await Promise.all([
      supabase.from("lawyer_clients").select("id").eq("lawyer_id", user.id),
      supabase.from("lawyer_clients").select("id").eq("client_user_id", user.id),
    ]);

    const ids = [
      ...(asLawyer || []).map((r) => r.id),
      ...(asClient || []).map((r) => r.id),
    ];

    if (!ids.length) { setUnreadCount(0); return; }

    const { count } = await supabase
      .from("lawyer_chat_messages")
      .select("id", { count: "exact", head: true })
      .in("lawyer_client_id", ids)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    setUnreadCount(count || 0);
  };

  useEffect(() => {
    if (!user) return;
    refresh();
    const ch = supabase
      .channel(`unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lawyer_chat_messages" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  return { unreadCount, refresh };
};
