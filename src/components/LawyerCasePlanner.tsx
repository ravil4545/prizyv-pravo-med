import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { extractFnError } from "@/lib/edgeError";
import { Sparkles, Loader2, Stethoscope, ListChecks, AlertCircle } from "lucide-react";

// Планировщик A3: показывает сохранённые examination_plan_items / action_plan_items
// и умеет (пере)генерировать их через edge-функцию lawyer-build-plan.
// Таблицы ещё не в сгенерированных типах Supabase → доступ через (supabase as any),
// как принято в проекте для не-типизированной схемы.

interface ExamItem {
  id: string;
  item_type: string; // analysis | examination | specialist
  name: string;
  reason: string | null;
  status: string; // planned | in_progress | done | cancelled
  source: string; // ai | lawyer
}
interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: string; // todo | doing | done | cancelled
  priority: string; // low | normal | high
  source: string;
}

const EXAM_TYPE_LABEL: Record<string, string> = {
  analysis: "Анализ",
  examination: "Обследование",
  specialist: "Специалист",
};
const PRIORITY_LABEL: Record<string, string> = { low: "низкий", normal: "обычный", high: "высокий" };

interface Props {
  lawyerClientId: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const LawyerCasePlanner = ({ lawyerClientId, isPro, onUpgrade }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exam, setExam] = useState<ExamItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState<string>("");

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      (supabase as any)
        .from("examination_plan_items")
        .select("id,item_type,name,reason,status,source")
        .eq("lawyer_client_id", lawyerClientId)
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("action_plan_items")
        .select("id,title,description,status,priority,source")
        .eq("lawyer_client_id", lawyerClientId)
        .order("order_index", { ascending: true }),
    ]);
    setExam((e as ExamItem[]) || []);
    setActions((a as ActionItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawyerClientId]);

  const generate = async () => {
    if (!isPro) {
      onUpgrade();
      return;
    }
    setGenerating(true);
    setSummary("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-build-plan", {
        body: { lawyerClientId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractFnError(res.error));
      setExam((res.data?.examinationPlan as ExamItem[]) || []);
      setActions((res.data?.actionPlan as ActionItem[]) || []);
      setSummary(res.data?.summary || "");
      const exN = res.data?.examinationPlan?.length ?? 0;
      const acN = res.data?.actionPlan?.length ?? 0;
      toast({ title: "План готов", description: `Дообследование: ${exN} · действия: ${acN}` });
    } catch (err) {
      toast({
        title: "Не удалось построить план",
        description: err instanceof Error ? err.message : "Ошибка ИИ",
        variant: "destructive",
      });
    }
    setGenerating(false);
  };

  // Тоггл «выполнено» — RLS разрешает юристу UPDATE своих планов.
  const toggleExam = async (item: ExamItem) => {
    const next = item.status === "done" ? "planned" : "done";
    setExam((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    const { error } = await (supabase as any)
      .from("examination_plan_items")
      .update({ status: next })
      .eq("id", item.id);
    if (error) {
      setExam((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)));
      toast({ title: "Не сохранилось", description: error.message, variant: "destructive" });
    }
  };

  const toggleAction = async (item: ActionItem) => {
    const next = item.status === "done" ? "todo" : "done";
    setActions((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    const { error } = await (supabase as any)
      .from("action_plan_items")
      .update({ status: next })
      .eq("id", item.id);
    if (error) {
      setActions((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)));
      toast({ title: "Не сохранилось", description: error.message, variant: "destructive" });
    }
  };

  const isEmpty = !loading && exam.length === 0 && actions.length === 0;

  return (
    <div className="space-y-4">
      {!isPro && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm flex-1">
              Планировщик дела доступен в тарифе <strong>Pro</strong>: ИИ соберёт план дообследования
              и тактический план действий по Расписанию болезней.
            </p>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0" onClick={onUpgrade}>
              Upgrade
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          ИИ-планировщик грунтуется на документах дела и Расписании болезней. Перегенерация заменяет
          ИИ-пункты, ваши ручные правки статусов сохраняются.
        </p>
        <Button size="sm" onClick={generate} disabled={generating || !isPro} className="flex-shrink-0">
          {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {exam.length || actions.length ? "Перестроить план" : "Построить план"}
        </Button>
      </div>

      {summary && (
        <Card className="border-gold/30 bg-gold/5">
          <CardContent className="p-4 text-sm whitespace-pre-wrap leading-relaxed">{summary}</CardContent>
        </Card>
      )}

      {loading ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">План ещё не построен. Нажмите «Построить план».</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* План дообследования */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                План дообследования
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exam.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пунктов нет.</p>
              ) : (
                exam.map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 rounded-md border bg-background/60 p-2.5">
                    <Checkbox
                      checked={item.status === "done"}
                      onCheckedChange={() => toggleExam(item)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {EXAM_TYPE_LABEL[item.item_type] || item.item_type}
                        </Badge>
                        <span className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {item.name}
                        </span>
                      </div>
                      {item.reason && <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Тактический план действий */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                План действий юриста
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Шагов нет.</p>
              ) : (
                actions.map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 rounded-md border bg-background/60 p-2.5">
                    <Checkbox
                      checked={item.status === "done"}
                      onCheckedChange={() => toggleAction(item)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.priority && item.priority !== "normal" && (
                          <Badge
                            variant={item.priority === "high" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {PRIORITY_LABEL[item.priority] || item.priority}
                          </Badge>
                        )}
                        <span className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {item.title}
                        </span>
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LawyerCasePlanner;
