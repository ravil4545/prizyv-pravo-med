/// <reference lib="deno.ns" />
// Итоги по гонорарам. Запуск: deno test tests/

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  INVOICE_STATUSES,
  invoiceStatusDef,
  sumInvoices,
  type InvoiceStatus,
} from "../src/lib/invoiceModel.ts";
import { formatKopecks } from "../src/lib/money.ts";

const inv = (amountKopecks: number, status: InvoiceStatus) => ({ amountKopecks, status });

Deno.test("итоги разложены по статусам, отменённые не считаются нигде", () => {
  const totals = sumInvoices([
    inv(9_000_000, "paid"),
    inv(4_500_000, "paid"),
    inv(9_000_000, "issued"),
    inv(1_000_000, "draft"),
    // Отменённый счёт остаётся в истории, но в деньгах его нет.
    inv(50_000_000, "cancelled"),
  ]);

  assertEquals(totals.paid, 13_500_000);
  assertEquals(totals.awaiting, 9_000_000);
  assertEquals(totals.draft, 1_000_000);
  assertEquals(formatKopecks(totals.paid), "135 000 ₽");
});

Deno.test("пустой список даёт нули, а не NaN", () => {
  assertEquals(sumInvoices([]), { paid: 0, awaiting: 0, draft: 0 });
});

Deno.test("копейки не теряются при суммировании сотни счетов", () => {
  const many = Array.from({ length: 100 }, () => inv(9_000_033, "paid"));
  assertEquals(sumInvoices(many).paid, 900_003_300);
  assertEquals(formatKopecks(sumInvoices(many).paid), "9 000 033 ₽");
});

Deno.test("справочник статусов согласован с ограничением в БД", () => {
  // Значения должны совпадать с lawyer_invoices_status_check.
  assertEquals(INVOICE_STATUSES.map((s) => s.value).sort(), ["cancelled", "draft", "issued", "paid"]);
  // Выручкой считается ровно один статус — иначе сводка врёт.
  assertEquals(INVOICE_STATUSES.filter((s) => s.isRevenue).map((s) => s.value), ["paid"]);
});

Deno.test("неизвестный статус из БД не роняет интерфейс", () => {
  assertEquals(invoiceStatusDef("что-то_новое").value, "draft");
  assertEquals(invoiceStatusDef("paid").label, "Оплачен");
});
