-- ════════════════════════════════════════════════════════════════════════
--  Продолжение 20260725200246_revoke_anon_execute.sql.
--
--  После первой миграции проверка показала, что пять функций всё ещё
--  доступны роли anon. Причина: EXECUTE был выдан не роли anon, а
--  ПСЕВДОРОЛИ PUBLIC, а `revoke … from anon` её грант не снимает —
--  has_function_privilege по-прежнему возвращал true. Снимаем с PUBLIC и
--  возвращаем точечно тем, кому право действительно нужно.
-- ════════════════════════════════════════════════════════════════════════

-- Требуют авторизации: фронт зовёт их из кабинета под живым пользователем.
revoke execute on function public.increment_ai_question_usage() from public;
grant execute on function public.increment_ai_question_usage() to authenticated;

revoke execute on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;

-- Триггерные: прямой вызов не предусмотрен. При срабатывании триггера
-- PostgreSQL право EXECUTE не проверяет — оно нужно только на момент
-- создания триггера, поэтому отзыв ничего не ломает.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user_subscription() from public;
revoke execute on function public.enforce_document_upload_quota() from public;
revoke execute on function public.update_updated_at_column() from public;

-- has_role НАМЕРЕННО оставлена доступной anon: на неё ссылаются RLS-политики,
-- а политика исполняется в правах вызывающей роли. Без EXECUTE публичные
-- страницы отдавали бы ОШИБКУ запроса вместо пустой выборки — то есть блог и
-- каталог диагнозов перестали бы открываться у разлогиненных.
