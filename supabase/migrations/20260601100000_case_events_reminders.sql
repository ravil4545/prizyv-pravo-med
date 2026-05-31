-- Модуль 4 / Фаза 3: поля напоминаний для событий-дедлайнов (case_events).
-- Используются cron-функцией send-deadline-reminders для рассылки за 3 / 1 / 0
-- дней до event_date (e-mail клиенту и закреплённому юристу).
--
-- Таблица аддитивна: только новые колонки со значениями по умолчанию.
-- RLS не меняется — владелец уже имеет политики select/insert/update/delete
-- на свои строки, а cron-функция работает под service_role (минует RLS).

alter table public.case_events
  add column if not exists remind_enabled      boolean not null default true,
  add column if not exists notify_client_email boolean not null default true,
  add column if not exists notify_lawyer_email boolean not null default true,
  add column if not exists notify_client_push  boolean not null default false,
  add column if not exists reminders_sent      text[]  not null default '{}'::text[];

comment on column public.case_events.remind_enabled is
  'Слать ли напоминания по этому событию.';
comment on column public.case_events.reminders_sent is
  'Уже отправленные окна напоминаний: d3 / d1 / d0 (за 3 дня, за сутки, в день события).';
