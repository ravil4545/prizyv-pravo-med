// ════════════════════════════════════════════════════════════════════════
//  Гонорары по делам: доступ к данным (§6 предложения).
//
//  Единственный реальный пробел CRM: канбан по стадиям, лента дела (case_notes
//  с realtime) и задачи со сроками (action_plan_items + /lawyer/agenda) в
//  проекте уже были построены. А деньги велись вне системы.
//
//  Типы, статусы и арифметика — в invoiceModel.ts (чистый модуль под тесты).
// ════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";
import { isKnownStatus, type Invoice, type InvoiceStatus } from "./invoiceModel";

export * from "./invoiceModel";

interface DbRow {
  id: string;
  lawyer_client_id: string;
  amount_kopecks: number;
  status: string;
  title: string;
  description: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
}

const SELECT =
  "id, lawyer_client_id, amount_kopecks, status, title, description, issued_at, due_at, paid_at, created_at";

const fromRow = (r: DbRow): Invoice => ({
  id: r.id,
  lawyerClientId: r.lawyer_client_id,
  // bigint приезжает из PostgREST строкой при больших значениях — приводим явно.
  amountKopecks: Number(r.amount_kopecks) || 0,
  status: (isKnownStatus(r.status) ? r.status : "draft") as InvoiceStatus,
  title: r.title,
  description: r.description,
  issuedAt: r.issued_at,
  dueAt: r.due_at,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});

export async function listInvoices(lawyerClientId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("lawyer_invoices")
    .select(SELECT)
    .eq("lawyer_client_id", lawyerClientId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DbRow[]).map(fromRow);
}

export interface InvoiceInput {
  id?: string | null;
  lawyerClientId: string;
  amountKopecks: number;
  status: InvoiceStatus;
  title: string;
  description?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
}

export async function saveInvoice(input: InvoiceInput): Promise<Invoice> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Нужно войти в аккаунт");

  // В БД стоит ограничение «оплачен -> дата оплаты обязательна»: без неё
  // выручка по периодам считается неверно. Подставляем сегодняшнюю, а не роняем
  // сохранение из-за забытого поля.
  const paidAt = input.status === "paid"
    ? (input.paidAt || new Date().toISOString().slice(0, 10))
    : (input.paidAt ?? null);

  const payload = {
    lawyer_id: user.id,
    lawyer_client_id: input.lawyerClientId,
    amount_kopecks: input.amountKopecks,
    status: input.status,
    title: input.title.trim() || "Без названия",
    description: input.description?.trim() || null,
    issued_at: input.issuedAt ?? null,
    due_at: input.dueAt ?? null,
    paid_at: paidAt,
  };

  const query = input.id
    ? supabase.from("lawyer_invoices").update(payload).eq("id", input.id)
    : supabase.from("lawyer_invoices").insert(payload);

  const { data, error } = await query.select(SELECT).single();
  if (error) throw new Error(error.message);
  return fromRow(data as unknown as DbRow);
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("lawyer_invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
