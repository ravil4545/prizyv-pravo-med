/* eslint-disable @typescript-eslint/no-explicit-any */
// Таблицы планов дела ещё не в сгенерированных типах Supabase → доступ через
// (supabase as any) (см. примечание ниже). any здесь намеренный и локальный.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { extractFnError } from "@/lib/edgeError";
import {
  Sparkles, Loader2, Stethoscope, ListChecks, AlertCircle,
  Plus, Pencil, Trash2, Check, X, CalendarClock,
} from "lucide-react";
import { deadlineBucket, deadlineToneClass, formatDueLabel } from "@/lib/deadlines";

// Планировщик A3: показывает сохранённые examination_plan_items / action_plan_items
// и умеет (пере)генерировать их через edge-функцию lawyer-build-plan.
// Юрист также может вести план ВРУЧНУЮ: добавлять/редактировать/удалять пункты.
// Ручные пункты помечаются source='lawyer' — при ИИ-перегенерации они
// СОХРАНЯЮТСЯ (бэкенд удаляет только source='ai'). Таблицы ещё не в
// сгенерированных типах Supabase → доступ через (supabase as any).

interface ExamItem {
  id: string;
  item_type: string; // analysis | examination | specialist
  name: string;
  reason: string | null;
  status: string; // planned | in_progress | done | cancelled
  source: string; // ai | lawyer
  due_date: string | null;
}
interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: string; // todo | doing | done | cancelled
  priority: string; // low | normal | high
  source: string;
  due_date: string | null;
}

const EXAM_TYPE_LABEL: Record<string, string> = {
  analysis: "Анализ",
  examination: "Обследование",
  specialist: "Специалист",
};
const PRIORITY_LABEL: Record<string, string> = { low: "низкий", normal: "обычный", high: "высокий" };

// Черновики редактора (id=null → добавление нового пункта, id задан → правка).
interface ExamDraft { id: string | null; item_type: string; name: string; reason: string; due_date: string; }
interface ActionDraft { id: string | null; title: string; description: string; priority: string; due_date: string; }

interface Props {
  lawyerClientId: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const LawyerCasePlanner = ({ lawyerClientId, isPro, onUpgrade }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exam, setExam] = useState<ExamItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState<string>("");

  // Редакторы: null = закрыт. Для дообследования и для действий — раздельные.
  const [examDraft, setExamDraft] = useState<ExamDraft | null>(null);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      (supabase as any)
        .from("examination_plan_items")
        .select("id,item_type,name,reason,status,source,due_date")
        .eq("lawyer_client_id", lawyerClientId)
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("action_plan_items")
        .select("id,title,description,status,priority,source,due_date")
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
      // Ответ перечитывает ВСЕ пункты из БД (и ai, и lawyer) — ручные пункты
      // остаются на месте, ИИ заменяет только свои.
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

  // ── Статус «выполнено» ────────────────────────────────────────────────────
  const toggleExam = async (item: ExamItem) => {
    const next = item.status === "done" ? "planned" : "done";
    setExam((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    const { error } = await (supabase as any)
      .from("examination_plan_items").update({ status: next }).eq("id", item.id);
    if (error) {
      setExam((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)));
      toast({ title: "Не сохранилось", description: error.message, variant: "destructive" });
    }
  };

  const toggleAction = async (item: ActionItem) => {
    const next = item.status === "done" ? "todo" : "done";
    setActions((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: next } : x)));
    const { error } = await (supabase as any)
      .from("action_plan_items").update({ status: next }).eq("id", item.id);
    if (error) {
      setActions((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: item.status } : x)));
      toast({ title: "Не сохранилось", description: error.message, variant: "destructive" });
    }
  };

  // ── Сохранение черновика дообследования (добавление или правка) ────────────
  const saveExamDraft = async () => {
    if (!examDraft || !user) return;
    const name = examDraft.name.trim();
    if (!name) { toast({ title: "Введите название пункта", variant: "destructive" }); return; }
    const reason = examDraft.reason.trim() || null;
    const due_date = examDraft.due_date || null;
    setSavingDraft(true);
    if (examDraft.id) {
      const { error } = await (supabase as any)
        .from("examination_plan_items")
        .update({ item_type: examDraft.item_type, name, reason, due_date })
        .eq("id", examDraft.id);
      if (error) { toast({ title: "Не сохранилось", description: error.message, variant: "destructive" }); setSavingDraft(false); return; }
      setExam((prev) => prev.map((x) => (x.id === examDraft.id ? { ...x, item_type: examDraft.item_type, name, reason, due_date } : x)));
    } else {
      const { data, error } = await (supabase as any)
        .from("examination_plan_items")
        .insert({
          lawyer_client_id: lawyerClientId, lawyer_id: user.id,
          item_type: examDraft.item_type, name, reason, due_date,
          status: "planned", source: "lawyer", created_by: user.id,
        })
        .select("id,item_type,name,reason,status,source,due_date").single();
      if (error || !data) { toast({ title: "Не удалось добавить", description: error?.message, variant: "destructive" }); setSavingDraft(false); return; }
      setExam((prev) => [...prev, data as ExamItem]);
    }
    setExamDraft(null);
    setSavingDraft(false);
  };

  const deleteExam = async (id: string) => {
    const prev = exam;
    setExam((p) => p.filter((x) => x.id !== id));
    const { error } = await (supabase as any).from("examination_plan_items").delete().eq("id", id);
    if (error) { setExam(prev); toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" }); }
  };

  // ── Сохранение черновика действия (добавление или правка) ──────────────────
  const saveActionDraft = async () => {
    if (!actionDraft || !user) return;
    const title = actionDraft.title.trim();
    if (!title) { toast({ title: "Введите название шага", variant: "destructive" }); return; }
    const description = actionDraft.description.trim() || null;
    const due_date = actionDraft.due_date || null;
    setSavingDraft(true);
    if (actionDraft.id) {
      const { error } = await (supabase as any)
        .from("action_plan_items")
        .update({ title, description, priority: actionDraft.priority, due_date })
        .eq("id", actionDraft.id);
      if (error) { toast({ title: "Не сохранилось", description: error.message, variant: "destructive" }); setSavingDraft(false); return; }
      setActions((prev) => prev.map((x) => (x.id === actionDraft.id ? { ...x, title, description, priority: actionDraft.priority, due_date } : x)));
    } else {
      const { data, error } = await (supabase as any)
        .from("action_plan_items")
        .insert({
          lawyer_client_id: lawyerClientId, lawyer_id: user.id,
          title, description, priority: actionDraft.priority, due_date,
          status: "todo", order_index: actions.length, source: "lawyer", created_by: user.id,
        })
        .select("id,title,description,status,priority,source,due_date").single();
      if (error || !data) { toast({ title: "Не удалось добавить", description: error?.message, variant: "destructive" }); setSavingDraft(false); return; }
      setActions((prev) => [...prev, data as ActionItem]);
    }
    setActionDraft(null);
    setSavingDraft(false);
  };

  const deleteAction = async (id: string) => {
    const prev = actions;
    setActions((p) => p.filter((x) => x.id !== id));
    const { error } = await (supabase as any).from("action_plan_items").delete().eq("id", id);
    if (error) { setActions(prev); toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" }); }
  };

  // ── Inline-редактор дообследования (используется и для add, и для edit) ────
  const examEditor = () => (
    <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={examDraft!.item_type}
          onValueChange={(v) => setExamDraft((d) => (d ? { ...d, item_type: v } : d))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="analysis">Анализ</SelectItem>
            <SelectItem value="examination">Обследование</SelectItem>
            <SelectItem value="specialist">Специалист</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="col-span-2 h-8 text-sm"
          placeholder="Что именно (напр. рентген стопы)"
          value={examDraft!.name}
          onChange={(e) => setExamDraft((d) => (d ? { ...d, name: e.target.value } : d))}
          autoFocus
        />
      </div>
      <Input
        className="h-8 text-sm"
        placeholder="Зачем (необязательно)"
        value={examDraft!.reason}
        onChange={(e) => setExamDraft((d) => (d ? { ...d, reason: e.target.value } : d))}
      />
      <div className="flex items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Срок:</span>
        <Input
          type="date"
          className="h-8 w-auto text-sm"
          value={examDraft!.due_date}
          onChange={(e) => setExamDraft((d) => (d ? { ...d, due_date: e.target.value } : d))}
        />
        {examDraft!.due_date && (
          <Button
            size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setExamDraft((d) => (d ? { ...d, due_date: "" } : d))}
          >
            Сбросить
          </Button>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setExamDraft(null)} disabled={savingDraft}>
          <X className="h-3.5 w-3.5 mr-1" />Отмена
        </Button>
        <Button size="sm" onClick={saveExamDraft} disabled={savingDraft}>
          {savingDraft ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          Сохранить
        </Button>
      </div>
    </div>
  );

  const actionEditor = () => (
    <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={actionDraft!.priority}
          onValueChange={(v) => setActionDraft((d) => (d ? { ...d, priority: v } : d))}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Низкий</SelectItem>
            <SelectItem value="normal">Обычный</SelectItem>
            <SelectItem value="high">Высокий</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="col-span-2 h-8 text-sm"
          placeholder="Шаг (напр. подать заявление на ВВЭ)"
          value={actionDraft!.title}
          onChange={(e) => setActionDraft((d) => (d ? { ...d, title: e.target.value } : d))}
          autoFocus
        />
      </div>
      <Textarea
        className="text-sm min-h-[56px]"
        placeholder="Детали / как сделать (необязательно)"
        value={actionDraft!.description}
        onChange={(e) => setActionDraft((d) => (d ? { ...d, description: e.target.value } : d))}
      />
      <div className="flex items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Срок:</span>
        <Input
          type="date"
          className="h-8 w-auto text-sm"
          value={actionDraft!.due_date}
          onChange={(e) => setActionDraft((d) => (d ? { ...d, due_date: e.target.value } : d))}
        />
        {actionDraft!.due_date && (
          <Button
            size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setActionDraft((d) => (d ? { ...d, due_date: "" } : d))}
          >
            Сбросить
          </Button>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setActionDraft(null)} disabled={savingDraft}>
          <X className="h-3.5 w-3.5 mr-1" />Отмена
        </Button>
        <Button size="sm" onClick={saveActionDraft} disabled={savingDraft}>
          {savingDraft ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          Сохранить
        </Button>
      </div>
    </div>
  );

  // Чип срока для пункта плана: цвет по близости дедлайна, перечёркнут если выполнено.
  const dueChip = (due: string | null, done: boolean) => {
    if (!due) return null;
    const bucket = deadlineBucket(due);
    const tone = done || !bucket ? "text-muted-foreground" : deadlineToneClass(bucket);
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${done ? "line-through " : ""}${tone}`}>
        <CalendarClock className="h-3 w-3" />
        {formatDueLabel(due)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {!isPro && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm flex-1">
              ИИ-планировщик доступен в тарифе <strong>Pro</strong>: ИИ соберёт план дообследования
              и тактический план действий по Расписанию болезней. Вести план вручную можно и сейчас.
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
          только ИИ-пункты — ваши ручные пункты и правки статусов сохраняются.
        </p>
        <Button size="sm" onClick={generate} disabled={generating || !isPro} className="flex-shrink-0">
          {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {exam.length || actions.length ? "Перестроить план ИИ" : "Построить план ИИ"}
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* ── План дообследования ──────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                План дообследования
              </CardTitle>
              <Button
                size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => setExamDraft({ id: null, item_type: "examination", name: "", reason: "", due_date: "" })}
                disabled={!!examDraft}
              >
                <Plus className="h-3.5 w-3.5" /> Пункт
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {exam.length === 0 && !examDraft ? (
                <p className="text-sm text-muted-foreground">Пунктов нет. Добавьте вручную или постройте ИИ-план.</p>
              ) : (
                exam.map((item) =>
                  examDraft && examDraft.id === item.id ? (
                    <div key={item.id}>{examEditor()}</div>
                  ) : (
                    <div key={item.id} className="group flex items-start gap-2.5 rounded-md border bg-background/60 p-2.5">
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
                          {item.source === "lawyer" && (
                            <Badge variant="secondary" className="text-[10px]">вручную</Badge>
                          )}
                          <span className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {item.name}
                          </span>
                          {dueChip(item.due_date, item.status === "done")}
                        </div>
                        {item.reason && <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setExamDraft({ id: item.id, item_type: item.item_type, name: item.name, reason: item.reason || "", due_date: item.due_date || "" })}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteExam(item.id)}
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ),
                )
              )}
              {examDraft && examDraft.id === null && examEditor()}
            </CardContent>
          </Card>

          {/* ── Тактический план действий ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                План действий юриста
              </CardTitle>
              <Button
                size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => setActionDraft({ id: null, title: "", description: "", priority: "normal", due_date: "" })}
                disabled={!!actionDraft}
              >
                <Plus className="h-3.5 w-3.5" /> Шаг
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {actions.length === 0 && !actionDraft ? (
                <p className="text-sm text-muted-foreground">Шагов нет. Добавьте вручную или постройте ИИ-план.</p>
              ) : (
                actions.map((item) =>
                  actionDraft && actionDraft.id === item.id ? (
                    <div key={item.id}>{actionEditor()}</div>
                  ) : (
                    <div key={item.id} className="group flex items-start gap-2.5 rounded-md border bg-background/60 p-2.5">
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
                          {item.source === "lawyer" && (
                            <Badge variant="secondary" className="text-[10px]">вручную</Badge>
                          )}
                          <span className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {item.title}
                          </span>
                          {dueChip(item.due_date, item.status === "done")}
                        </div>
                        {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setActionDraft({ id: item.id, title: item.title, description: item.description || "", priority: item.priority || "normal", due_date: item.due_date || "" })}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteAction(item.id)}
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ),
                )
              )}
              {actionDraft && actionDraft.id === null && actionEditor()}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LawyerCasePlanner;
