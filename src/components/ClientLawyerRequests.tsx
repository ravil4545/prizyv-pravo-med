import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Check, X, Loader2, Briefcase, FileText, Brain, MessageSquare, ShieldCheck,
} from "lucide-react";

interface PendingRequest {
  lawyer_client_id: string;
  lawyer_id: string;
  lawyer_name: string | null;
  lawyer_specialization: string | null;
  lawyer_photo_url: string | null;
  requested_at: string;
  client_name_in_crm: string;
}

/**
 * Блок «Запросы от юристов» в кабинете клиента.
 *
 * Источник данных — RPC client_pending_requests() (SECURITY DEFINER), которая
 * возвращает все карточки lawyer_clients со state='pending_client_approval',
 * адресованные текущему юзеру либо по client_user_id, либо по target_email.
 *
 * Действия:
 *   • «Принять» (одна кнопка) → RPC client_accept_request → ставится связь,
 *     открывается доступ к меддокам/AI, появляется чат с юристом.
 *   • «Отклонить» → RPC client_decline_request с подтверждением.
 *
 * Realtime: подписываемся на public.lawyer_clients и обновляемся при любом
 * INSERT/UPDATE (фильтр по client_user_id или target_email сложно сделать
 * на уровне БД, поэтому фильтрация в JS — для одиночного юзера это окей).
 */
const ClientLawyerRequests = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<PendingRequest | null>(null);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("client_pending_requests");
    if (error) {
      // RPC может ещё не быть применена в БД — мягкий фолбэк, не показываем блок.
      console.warn("client_pending_requests not ready:", error.message);
      setRequests([]);
      setLoading(false);
      return;
    }
    setRequests((data as PendingRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();

    // Realtime: pending-запрос может появиться, пока юзер сидит на дашборде.
    const ch = supabase
      .channel(`client-pending-requests-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const acceptRequest = async (req: PendingRequest) => {
    setBusyId(req.lawyer_client_id);
    const { error } = await supabase.rpc("client_accept_request", {
      p_lawyer_client_id: req.lawyer_client_id,
    });
    setBusyId(null);
    if (error) {
      toast({ title: "Не удалось принять запрос", description: error.message, variant: "destructive" });
      return;
    }
    setRequests((prev) => prev.filter((r) => r.lawyer_client_id !== req.lawyer_client_id));
    toast({
      title: `Вы подключились к юристу ${req.lawyer_name || ""}`.trim(),
      description: "Доступ к документам и ИИ-анализам открыт. В чате теперь можно писать юристу.",
    });
  };

  const declineRequest = async () => {
    if (!declineTarget) return;
    setBusyId(declineTarget.lawyer_client_id);
    const { error } = await supabase.rpc("client_decline_request", {
      p_lawyer_client_id: declineTarget.lawyer_client_id,
    });
    setBusyId(null);
    if (error) {
      toast({ title: "Не удалось отклонить", description: error.message, variant: "destructive" });
      return;
    }
    setRequests((prev) => prev.filter((r) => r.lawyer_client_id !== declineTarget.lawyer_client_id));
    setDeclineTarget(null);
    toast({ title: "Запрос отклонён" });
  };

  // Если запросов нет — компонент не рендерит ничего (не занимает место в дашборде).
  if (loading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (requests.length === 0) return null;

  return (
    <>
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-violet-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Запросы от юристов
            <Badge className="bg-primary text-primary-foreground">{requests.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Юрист предлагает вам работать вместе через nepriziv.ru. После подтверждения он получит
            доступ к вашим медицинским документам и ИИ-анализам, вы — к чату с ним и общим инструментам.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.lawyer_client_id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card"
            >
              {/* Avatar */}
              <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                {req.lawyer_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={req.lawyer_photo_url} alt={req.lawyer_name || "Юрист"} className="h-full w-full object-cover" />
                ) : (
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold text-sm">
                  {req.lawyer_name || "Юрист"}
                </p>
                {req.lawyer_specialization && (
                  <p className="text-xs text-muted-foreground">{req.lawyer_specialization}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Запрос отправлен {new Date(req.requested_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </p>

                {/* Что произойдёт после принятия */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <FileText className="h-3 w-3" /> Доступ к документам
                  </span>
                  <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                    <Brain className="h-3 w-3" /> ИИ-анализы
                  </span>
                  <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    <MessageSquare className="h-3 w-3" /> Чат
                  </span>
                  <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    <ShieldCheck className="h-3 w-3" /> Отозвать можно в один клик
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => acceptRequest(req)}
                  disabled={busyId === req.lawyer_client_id}
                >
                  {busyId === req.lawyer_client_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Принять
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                  onClick={() => setDeclineTarget(req)}
                  disabled={busyId === req.lawyer_client_id}
                >
                  <X className="h-3.5 w-3.5" /> Отклонить
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={!!declineTarget} onOpenChange={(open) => { if (!open) setDeclineTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отклонить запрос?</AlertDialogTitle>
            <AlertDialogDescription>
              Юрист «{declineTarget?.lawyer_name || "—"}» не получит доступ к вашим документам и чату.
              Если передумаете — попросите юриста отправить новый запрос или дать вам код приглашения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); declineRequest(); }}
              disabled={!!busyId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
              Отклонить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ClientLawyerRequests;
