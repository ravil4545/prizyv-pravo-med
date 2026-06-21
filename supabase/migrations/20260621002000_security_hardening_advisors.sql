-- Security hardening по результатам Supabase advisors (аудит 2026-06-21).
-- Включены ТОЛЬКО точечные, безопасные исправления, проверенные по факту:
--   1) rag_index — единственный ERROR линтера (SECURITY DEFINER view).
--   2) 6 триггерных функций без явного search_path (WARN function_search_path_mutable).
--
-- ВАЖНО (контекст): «anon access» на 44 таблицах из advisors — НЕ утечка.
-- Реальные политики PII-таблиц (medical_documents_v2, profiles, lawyer_clients,
-- user_subscriptions) уже ограничены условием auth.uid() = user_id, поэтому у
-- анонима (auth.uid() IS NULL) доступа к чужим строкам нет. Сужение роли
-- policies с public -> authenticated — это гигиена, делается отдельно и
-- осознанно (затрагивает публичный каталог юристов «Public reads active
-- lawyers» и т.п.), поэтому в эту миграцию НЕ включено.
--
-- Также вне SQL (Supabase Dashboard, 1 клик): включить Leaked Password
-- Protection (Auth -> Providers/Password) — advisor auth_leaked_password_protection.

-- 1. rag_index: применять RLS вызывающего, а не создателя представления.
-- Проверено: rag_index не используется ни во фронте (src), ни в edge-функциях;
-- его читают только ingest/build Python-скрипты под service_role (минует RLS),
-- поэтому смена на security_invoker не меняет рабочие сценарии.
ALTER VIEW public.rag_index SET (security_invoker = on);

-- 2. Зафиксировать search_path у триггерных функций (защита от подмены пути).
-- Все 6 — без аргументов, SECURITY INVOKER; изменение безопасно.
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_lawyer_client_name_from_profile() SET search_path = public, pg_temp;
ALTER FUNCTION public.fill_chat_recipient_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.fill_lawyer_invite_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_lawyer_invite_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_link_state_on_update() SET search_path = public, pg_temp;
