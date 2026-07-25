-- ════════════════════════════════════════════════════════════════════════
--  «Мои шаблоны» переезжают из localStorage в базу (§5 предложения).
--
--  Было: TemplatesWorkspace хранил пользовательские шаблоны в localStorage.
--  Последствия — очистил кэш или зашёл в приватном окне и потерял работу;
--  собранное на компьютере не видно с телефона; юрист не может передать
--  шаблон коллеге. Для инструмента, где человек вручную собирает юридический
--  документ, это неприемлемо.
--
--  Таблица общая для клиента и юриста, разделение по колонке scope — она
--  повторяет прежний namespace localStorage (storageKey).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.user_templates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,

  -- 'client' — кабинет призывника, 'lawyer' — кабинет юриста.
  scope        text not null default 'client',

  title        text not null,
  category     text not null default 'Свои шаблоны',
  body_template text not null default '',

  -- Поля редактора, таблицы и параметры печати. Форма структуры целиком на
  -- стороне клиента (EditorField/DocTable/DocFormat), поэтому jsonb, а не
  -- нормализованные таблицы: сервер этими данными не оперирует.
  fields       jsonb not null default '[]'::jsonb,
  tables       jsonb not null default '[]'::jsonb,
  format       jsonb not null default '{}'::jsonb,

  -- Ключ шаблона каталога, на основе которого собран документ (может быть
  -- null у «Моего шаблона» с нуля).
  base_key     text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint user_templates_scope_check check (scope in ('client', 'lawyer')),
  constraint user_templates_title_len   check (char_length(title) between 1 and 200),
  constraint user_templates_body_len    check (char_length(body_template) <= 100000)
);

comment on table public.user_templates is
  'Пользовательские шаблоны документов. Раньше жили в localStorage и терялись при очистке кэша.';

-- Выборка всегда «мои шаблоны в этом кабинете, свежие сверху».
create index if not exists user_templates_owner_scope_idx
  on public.user_templates (owner_id, scope, updated_at desc);

alter table public.user_templates enable row level security;

-- Владелец распоряжается своими шаблонами и только ими. Отдельные политики на
-- команду не нужны — доступ идентичен для всех операций.
--
-- Второе условие важнее, чем кажется. `revoke ... from anon` закрывает только
-- НЕавторизованные запросы, а анонимные сессии Supabase (signInAnonymously)
-- получают роль `authenticated` и под обычную политику проходят. В шаблонах
-- лежат ФИО, паспорт и адрес — временной анонимной сессии там делать нечего.
-- Это тот же класс замечаний, что аудит нашёл у 43 таблиц
-- (auth_allow_anonymous_sign_ins); здесь закрыт сразу.
drop policy if exists "Owner manages own templates" on public.user_templates;
create policy "Owner manages own templates"
  on public.user_templates
  for all
  to authenticated
  using (
    auth.uid() = owner_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    auth.uid() = owner_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

revoke all on public.user_templates from anon;

-- updated_at через уже существующий в проекте триггер-хелпер.
drop trigger if exists set_user_templates_updated_at on public.user_templates;
create trigger set_user_templates_updated_at
  before update on public.user_templates
  for each row
  execute function public.update_updated_at_column();
