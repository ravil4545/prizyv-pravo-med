-- ════════════════════════════════════════════════════════════════════════
--  Учёт гонораров по делам (§6 предложения).
--
--  Единственный реальный пробел CRM: канбан по стадиям, лента дела (case_notes
--  с realtime) и задачи со сроками (action_plan_items / examination_plan_items
--  + /lawyer/agenda) в проекте уже построены. А деньги велись вне системы —
--  при среднем чеке 90 000 ₽ это не про удобство, а про то, что юрист не видит,
--  кто заплатил.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.lawyer_invoices (
  id               uuid primary key default gen_random_uuid(),
  lawyer_id        uuid not null references auth.users(id) on delete cascade,
  lawyer_client_id uuid not null references public.lawyer_clients(id) on delete cascade,

  -- Суммы в КОПЕЙКАХ. Деньги в double — классический источник расхождений на
  -- копейку при суммировании; bigint избавляет от этого целиком.
  amount_kopecks   bigint not null,

  -- draft — черновик, issued — выставлен клиенту, paid — оплачен,
  -- cancelled — отменён (историю не удаляем, она нужна для отчётов).
  status           text not null default 'draft',

  title            text not null,
  description      text,

  issued_at        date,
  due_at           date,
  paid_at          date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint lawyer_invoices_status_check check (status in ('draft','issued','paid','cancelled')),
  constraint lawyer_invoices_amount_check check (amount_kopecks >= 0 and amount_kopecks <= 100000000000),
  constraint lawyer_invoices_title_len    check (char_length(title) between 1 and 200),
  -- Оплаченный счёт обязан иметь дату оплаты, иначе выручка по периодам врёт.
  constraint lawyer_invoices_paid_date    check (status <> 'paid' or paid_at is not null)
);

comment on table public.lawyer_invoices is
  'Гонорары по делам. Раньше учёт вёлся вне системы.';

create index if not exists lawyer_invoices_lawyer_status_idx
  on public.lawyer_invoices (lawyer_id, status, issued_at desc);
create index if not exists lawyer_invoices_client_idx
  on public.lawyer_invoices (lawyer_client_id, created_at desc);

alter table public.lawyer_invoices enable row level security;

-- Только юрист-владелец. Клиент свои счета через этот интерфейс НЕ видит:
-- показывать их клиенту — отдельное продуктовое решение, а не побочный эффект
-- учёта. Условие на is_anonymous — как в user_templates: анонимные сессии
-- Supabase получают роль authenticated и без него проходили бы.
drop policy if exists "Lawyer manages own invoices" on public.lawyer_invoices;
create policy "Lawyer manages own invoices"
  on public.lawyer_invoices
  for all
  to authenticated
  using (
    auth.uid() = lawyer_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    auth.uid() = lawyer_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

revoke all on public.lawyer_invoices from anon;

drop trigger if exists set_lawyer_invoices_updated_at on public.lawyer_invoices;
create trigger set_lawyer_invoices_updated_at
  before update on public.lawyer_invoices
  for each row
  execute function public.update_updated_at_column();
