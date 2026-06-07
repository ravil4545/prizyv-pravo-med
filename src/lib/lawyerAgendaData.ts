/* eslint-disable @typescript-eslint/no-explicit-any */
// Планы дела (action_plan_items / examination_plan_items) ещё не в сгенерированных
// типах Supabase, поэтому доступ к ним идёт через (supabase as any) — тот же приём,
// что и в LawyerCasePlanner / buildAIContext. any здесь намеренный и локальный.
import { supabase } from "@/integrations/supabase/client";
import { CRM_STAGE_LABELS } from "@/lib/crmStages";

// Сбор «сроков по делам» юриста из lawyer-owned таблиц. Используется и страницей
// /lawyer/agenda, и виджетом «Ближайшие сроки» на дашборде — одна логика, один
// формат. RLS отдаёт только строки текущего юриста (lawyer_id = auth.uid()).
// Планы ещё не в сгенерированных типах Supabase → (supabase as any).

export type AgendaKind = "conscription" | "action" | "exam";

export interface AgendaItem {
  id: string;        // уникальный ключ (kind+rawId)
  rawId: string;     // id строки в БД (для отметки «выполнено»)
  kind: AgendaKind;
  date: string;      // YYYY-MM-DD
  title: string;
  clientId: string;
  clientName: string;
  sub?: string;      // подпись (этап CRM / тип обследования)
  priority?: string; // urgent | high | normal | low
}

export const EXAM_TYPE_LABEL: Record<string, string> = {
  analysis: "Анализ",
  examination: "Обследование",
  specialist: "Специалист",
};

/** Все активные сроки юриста: даты призыва + дедлайны задач и дообследований. */
export async function loadAgendaItems(userId: string): Promise<AgendaItem[]> {
  const { data: clients } = await supabase
    .from("lawyer_clients")
    .select("id, client_name, conscription_date, crm_stage, priority, case_won, link_state")
    .eq("lawyer_id", userId);

  const clientMap = new Map<string, { name: string; archived: boolean }>();
  for (const c of (clients as any[]) || []) {
    clientMap.set(c.id, {
      name: c.client_name || "Без имени",
      archived: c.link_state === "archived",
    });
  }

  const [{ data: actions }, { data: exams }] = await Promise.all([
    (supabase as any)
      .from("action_plan_items")
      .select("id, lawyer_client_id, title, due_date, status, priority")
      .eq("lawyer_id", userId)
      .not("due_date", "is", null)
      .neq("status", "done")
      .neq("status", "cancelled"),
    (supabase as any)
      .from("examination_plan_items")
      .select("id, lawyer_client_id, name, due_date, status, item_type")
      .eq("lawyer_id", userId)
      .not("due_date", "is", null)
      .neq("status", "done")
      .neq("status", "cancelled"),
  ]);

  const next: AgendaItem[] = [];

  for (const c of (clients as any[]) || []) {
    if (!c.conscription_date || c.case_won || c.link_state === "archived") continue;
    const name = clientMap.get(c.id)?.name || "Без имени";
    next.push({
      id: `consc-${c.id}`,
      rawId: c.id,
      kind: "conscription",
      date: c.conscription_date,
      title: name,
      clientId: c.id,
      clientName: name,
      sub: CRM_STAGE_LABELS[c.crm_stage] || undefined,
      priority: c.priority,
    });
  }

  for (const a of (actions as any[]) || []) {
    const c = clientMap.get(a.lawyer_client_id);
    if (!c || c.archived) continue;
    next.push({
      id: `act-${a.id}`,
      rawId: a.id,
      kind: "action",
      date: a.due_date,
      title: a.title,
      clientId: a.lawyer_client_id,
      clientName: c.name,
      priority: a.priority,
    });
  }

  for (const e of (exams as any[]) || []) {
    const c = clientMap.get(e.lawyer_client_id);
    if (!c || c.archived) continue;
    next.push({
      id: `exam-${e.id}`,
      rawId: e.id,
      kind: "exam",
      date: e.due_date,
      title: e.name,
      clientId: e.lawyer_client_id,
      clientName: c.name,
      sub: EXAM_TYPE_LABEL[e.item_type] || undefined,
    });
  }

  return next;
}
