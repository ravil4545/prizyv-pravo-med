import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { withBrandPath } from "@/lib/brandPath";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Brain,
  Briefcase,
  Check,
  FileText,
  Loader2,
  MessageSquare,
  ShieldCheck,
  UserPlus,
  X,
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

const ClientLawyerRequests = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<PendingRequest | null>(null);

  const brandedPath = (target: string) => withBrandPath(location.pathname, target);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("client_pending_requests");
    if (error) {
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

    const email = user.email?.toLowerCase();
    let channel = supabase
      .channel(`client-pending-requests-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `client_user_id=eq.${user.id}` },
        () => load(),
      );

    if (email) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `target_email=eq.${email}` },
        () => load(),
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const acceptRequest = async (req: PendingRequest) => {
    setBusyId(req.lawyer_client_id);
    const { error } = await supabase.rpc("client_accept_request", {
      p_lawyer_client_id: req.lawyer_client_id,
    });
    setBusyId(null);

    if (error) {
      toast({
        title: "Не удалось принять запрос",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRequests((prev) => prev.filter((r) => r.lawyer_client_id !== req.lawyer_client_id));
    toast({
      title: "Юрист подключен",
      description: "Открываю чат, чтобы можно было сразу продолжить работу.",
    });
    navigate(brandedPath(`/client/chat/${req.lawyer_client_id}`));
  };

  const declineRequest = async () => {
    if (!declineTarget) return;
    setBusyId(declineTarget.lawyer_client_id);
    const { error } = await supabase.rpc("client_decline_request", {
      p_lawyer_client_id: declineTarget.lawyer_client_id,
    });
    setBusyId(null);

    if (error) {
      toast({
        title: "Не удалось отклонить запрос",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRequests((prev) => prev.filter((r) => r.lawyer_client_id !== declineTarget.lawyer_client_id));
    setDeclineTarget(null);
    toast({ title: "Запрос отклонен" });
  };

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
            Юрист предлагает связать ваш кабинет с его CRM. После принятия появится чат,
            а доступ к документам можно будет открыть или закрыть в один клик.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.lawyer_client_id}
              className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                  {req.lawyer_photo_url ? (
                    <img
                      src={req.lawyer_photo_url}
                      alt={req.lawyer_name || "Юрист"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-sm truncate">{req.lawyer_name || "Юрист"}</p>
                  {req.lawyer_specialization && (
                    <p className="text-xs text-muted-foreground line-clamp-2 break-words">{req.lawyer_specialization}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Запрос отправлен{" "}
                    {new Date(req.requested_at).toLocaleString("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <FileText className="h-3 w-3" /> Документы
                    </span>
                    <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                      <Brain className="h-3 w-3" /> ИИ-анализ
                    </span>
                    <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      <MessageSquare className="h-3 w-3" /> Чат
                    </span>
                    <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <ShieldCheck className="h-3 w-3" /> Доступ отзывной
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:flex-shrink-0">
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
                  <X className="h-3.5 w-3.5" />
                  Отклонить
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
              Юрист {declineTarget?.lawyer_name ? `«${declineTarget.lawyer_name}»` : ""} не получит доступ
              к вашим документам и чату. Если передумаете, попросите отправить новый запрос или код приглашения.
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
