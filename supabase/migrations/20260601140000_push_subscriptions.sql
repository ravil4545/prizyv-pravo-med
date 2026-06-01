-- Модуль 4 / Фаза 3b: web-push подписки клиента.
-- Хранит браузерные push-подписки (endpoint + ключи) для отправки уведомлений
-- о дедлайнах. Аддитивно, RLS: пользователь управляет только своими подписками.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Пользователь видит/создаёт/удаляет только свои подписки.
drop policy if exists "own_push_select" on public.push_subscriptions;
create policy "own_push_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "own_push_insert" on public.push_subscriptions;
create policy "own_push_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_push_update" on public.push_subscriptions;
create policy "own_push_update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_push_delete" on public.push_subscriptions;
create policy "own_push_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

comment on table public.push_subscriptions is
  'Браузерные web-push подписки клиента (Module 4 Phase 3b). Cron-функция читает их под service_role.';

-- Читатель VAPID-ключей из Vault для edge-функции отправки. SECURITY DEFINER,
-- доступ только service_role. Публичный ключ не секретный; приватный нужен
-- функции для подписи push и наружу (anon/authenticated) не отдаётся.
create or replace function public.get_vapid_keys()
returns table(public_key text, private_key text)
language sql
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key');
$$;

revoke all on function public.get_vapid_keys() from public;
revoke all on function public.get_vapid_keys() from anon, authenticated;
grant execute on function public.get_vapid_keys() to service_role;
