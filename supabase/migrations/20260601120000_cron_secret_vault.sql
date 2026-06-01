-- Модуль 4 / Фаза 3: единый секрет cron в Vault + валидатор для edge-функции.
-- Секрет генерируется в БД и хранится только в Vault (зашифрованно). И cron,
-- и функция send-deadline-reminders сверяются с одним этим значением — больше
-- нечему «разъезжаться», ручной CRON_SECRET в дашборде не нужен.
--
-- Идемпотентно: секрет создаётся только если его ещё нет; функция — or replace.

-- 1) Создать секрет, если его ещё нет (32 случайных байта → hex).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Shared secret for send-deadline-reminders cron (Module 4 Phase 3)'
    );
  end if;
end $$;

-- 2) Валидатор: true, если переданный токен совпадает с секретом из Vault.
--    SECURITY DEFINER (читает vault от владельца), доступен только service_role.
create or replace function public.match_cron_secret(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'cron_secret'
      and decrypted_secret = p_token
  );
$$;

revoke all on function public.match_cron_secret(text) from public;
revoke all on function public.match_cron_secret(text) from anon, authenticated;
grant execute on function public.match_cron_secret(text) to service_role;

-- 3) Ежедневный cron (06:00 UTC = 09:00 МСК): POST на edge-функцию с секретом
--    из Vault в заголовке x-cron-secret. Требует pg_cron + pg_net (включены).
--    Идемпотентно через unschedule по имени, затем schedule.
do $$
begin
  perform cron.unschedule('nepriziv-deadline-reminders');
exception when others then
  -- задачи с таким именем ещё нет — это нормально
  null;
end $$;

select cron.schedule(
  'nepriziv-deadline-reminders',
  '0 6 * * *',
  $cmd$
    select net.http_post(
      url := 'https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/send-deadline-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$
);
