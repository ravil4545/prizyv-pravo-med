import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getStageDef, getStageIndex, CRM_STAGE_ORDER } from "@/lib/crmStages";
import { Scale, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Статус дела ГЛАЗАМИ КЛИЕНТА (Этап 2 / A2).
 * Раньше клиент не видел, на каком этапе его дело и «кто сейчас ходит» —
 * crm_stage знал только юрист. Клиент может читать свою строку lawyer_clients
 * (RLS «Client views own lawyer entry»), поэтому показываем этап + прогресс +
 * признак эскалации спокойным, понятным языком.
 *
 * Рендерит null, если у клиента нет связанного дела — чтобы не шуметь на
 * дашборде у тех, кто ещё не подключил юриста.
 */
const ClientCaseStatusCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [row, setRow] = useState<any | null>(null);
  const [lawyerName, setLawyerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelEscalation = async () => {
    if (!row?.id) return;
    setCancelling(true);
    const { error } = await (supabase as any).rpc("client_cancel_escalation", {
      p_lawyer_client_id: row.id,
    });
    setCancelling(false);
    if (error) {
      toast({ title: "Не удалось отменить", description: error.message, variant: "destructive" });
      return;
    }
    setRow({ ...row, escalation_requested: false });
    toast({ title: "Запрос отменён" });
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;

    // select("*") — устойчиво к порядку деплоя: если миграция с
    // escalation_requested ещё не применена, поле просто будет undefined.
    const loadData = async () => {
      const { data } = await (supabase as any)
        .from("lawyer_clients")
        .select("*")
        .eq("client_user_id", user.id)
        .in("link_state", ["linked_active", "pending_client_approval"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setRow(data || null);
      if (data?.lawyer_id) {
        const { data: lp } = await (supabase as any)
          .from("lawyer_profiles")
          .select("full_name")
          .eq("user_id", data.lawyer_id)
          .maybeSingle();
        if (!cancelled) setLawyerName(lp?.full_name || null);
      }
      if (!cancelled) setLoading(false);
    };

    loadData();

    // Realtime: клиент видит смену этапа (crm_stage) и принятие эскалации
    // юристом без перезагрузки. lawyer_clients уже в supabase_realtime.
    const channel = supabase
      .channel(`client-case-status:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `client_user_id=eq.${user.id}` },
        () => { loadData(); },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  if (loading || !row) return null;

  const stage = getStageDef(row.crm_stage);
  const StageIcon = stage?.icon;
  const idx = getStageIndex(row.crm_stage);
  const total = CRM_STAGE_ORDER.length;
  const pct = idx >= 0 ? Math.round(((idx + 1) / total) * 100) : 0;
  const pending = row.link_state === "pending_client_approval";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          Статус вашего дела
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {lawyerName ? (
            <>Ваше дело ведёт <span className="font-medium text-foreground">{lawyerName}</span>.</>
          ) : (
            "Ваш юрист подключён."
          )}
        </div>

        {pending ? (
          <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
            Юрист ждёт вашего подтверждения
          </Badge>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {StageIcon && <StageIcon className="h-4 w-4 text-muted-foreground" />}
              <span className="font-medium">{stage?.label || row.crm_stage}</span>
              <span className="text-xs text-muted-foreground ml-auto">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${stage?.barClass || "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}

        {row.escalation_requested && (
          <div className="space-y-2 text-sm rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-rose-700 dark:text-rose-300">
                <p>
                  Запрос юристу отправлен
                  {row.escalated_at ? ` ${formatDistanceToNow(new Date(row.escalated_at), { addSuffix: true, locale: ru })}` : ""}.
                </p>
                <p className="text-xs mt-0.5 opacity-90">
                  Юрист ответит в течение рабочего дня (≈ 4–24 часа) — ответ придёт в чате.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              disabled={cancelling}
              onClick={handleCancelEscalation}
            >
              {cancelling ? "Отмена…" : "Отменить запрос"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientCaseStatusCard;
