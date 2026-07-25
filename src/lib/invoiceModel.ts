// ════════════════════════════════════════════════════════════════════════
//  Модель гонорара: типы, статусы, арифметика (§6 предложения).
//
//  Отделено от lawyerInvoices.ts (доступ к БД) СОЗНАТЕЛЬНО: этот модуль не
//  импортирует ни Supabase, ни React, поэтому его логику можно проверить
//  тестами (tests/lawyerInvoices_test.ts). Тот же приём, что в casePath.ts —
//  Deno-раннер не резолвит алиас «@/».
//
//  Суммы — в копейках, см. lib/money.ts.
// ════════════════════════════════════════════════════════════════════════

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export interface InvoiceStatusDef {
  value: InvoiceStatus;
  label: string;
  badgeClass: string;
  /** Учитывается ли сумма как реально полученные деньги. */
  isRevenue: boolean;
}

/** Значения обязаны совпадать с ограничением lawyer_invoices_status_check. */
export const INVOICE_STATUSES: InvoiceStatusDef[] = [
  { value: "draft", label: "Черновик", badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", isRevenue: false },
  { value: "issued", label: "Выставлен", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", isRevenue: false },
  { value: "paid", label: "Оплачен", badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", isRevenue: true },
  { value: "cancelled", label: "Отменён", badgeClass: "bg-muted text-muted-foreground", isRevenue: false },
];

/** Неизвестный статус из БД не должен ронять интерфейс. */
export const invoiceStatusDef = (v: string): InvoiceStatusDef =>
  INVOICE_STATUSES.find((s) => s.value === v) ?? INVOICE_STATUSES[0];

export const isKnownStatus = (v: string): v is InvoiceStatus =>
  INVOICE_STATUSES.some((s) => s.value === v);

export interface Invoice {
  id: string;
  lawyerClientId: string;
  amountKopecks: number;
  status: InvoiceStatus;
  title: string;
  description: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceTotals {
  /** Оплачено — реально полученные деньги. */
  paid: number;
  /** Выставлено и ждёт оплаты. */
  awaiting: number;
  /** Черновики — ещё не предъявлены клиенту. */
  draft: number;
}

/**
 * Итоги по счетам. Отменённые не считаются нигде — они остаются только в
 * истории, но в деньгах их нет.
 */
export function sumInvoices(
  invoices: Array<Pick<Invoice, "amountKopecks" | "status">>,
): InvoiceTotals {
  const totals: InvoiceTotals = { paid: 0, awaiting: 0, draft: 0 };
  for (const inv of invoices) {
    if (inv.status === "paid") totals.paid += inv.amountKopecks;
    else if (inv.status === "issued") totals.awaiting += inv.amountKopecks;
    else if (inv.status === "draft") totals.draft += inv.amountKopecks;
  }
  return totals;
}
