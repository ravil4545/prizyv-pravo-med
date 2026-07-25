-- ════════════════════════════════════════════════════════════════════════
--  Отзыв EXECUTE у ролей, которым эти функции не нужны (§10, волна 1).
--
--  ГЛАВНОЕ: bump_ai_rate_limit не проверяет вызывающего ВООБЩЕ — он просто
--  увеличивает счётчик по переданному ключу. При этом EXECUTE был выдан
--  роли anon, то есть разлогиненному посетителю с публичным anon-ключом.
--  Ключ счётчика предсказуем ("analyze-medical-document:user:<uuid>"), а
--  uuid пользователя видно в его же публичных данных. Значит, любой мог в
--  цикле выжечь чужой суточный лимит и на весь день лишить человека
--  разбора документов — ровно тот предохранитель, который поставлен
--  сегодня, и работал бы против пользователя.
--
--  llm_increment_rpd — тот же случай: без проверки, крутит ОБЩИЙ дневной
--  счётчик обращений к модели. Одним скриптом выводится из строя ИИ всего
--  сайта, а не одного человека.
--
--  Обе функции вызываются только из edge-функций под service_role
--  (_shared/aiUsage.ts). Из браузера их не зовёт никто — проверено
--  поиском по src: единственное упоминание в коде фронта — сгенерированные
--  типы.
--
--  ЧТО НАМЕРЕННО НЕ ТРОГАЕМ:
--  * has_role — на неё ссылаются RLS-политики. Политика выполняется в
--    правах вызывающей роли, поэтому отзыв EXECUTE у anon превратил бы
--    «не видно строк» в ОШИБКУ запроса и уронил бы публичные страницы.
--  * increment_ai_question_usage — её зовёт фронт (useSubscription), но
--    только у авторизованного. Внутри стоит проверка auth.uid(), поэтому
--    достаточно отозвать у anon и оставить authenticated.
--  * client_*/lawyer_*/*_invite — внутри проверяют auth.uid(), у anon его
--    нет. Отзываем у anon как второй рубеж, работу не меняем.
--  * Триггерные функции — PostgreSQL не проверяет EXECUTE при срабатывании
--    триггера, права нужны только на момент создания. Отзыв безопасен.
-- ════════════════════════════════════════════════════════════════════════

-- ── Счётчики: только service_role ────────────────────────────────────────
revoke execute on function public.bump_ai_rate_limit(text, timestamptz, integer)
  from anon, authenticated, public;
revoke execute on function public.llm_increment_rpd(text)
  from anon, authenticated, public;

grant execute on function public.bump_ai_rate_limit(text, timestamptz, integer)
  to service_role;
grant execute on function public.llm_increment_rpd(text) to service_role;

-- ── Функции, требующие авторизации: не нужны разлогиненному ──────────────
revoke execute on function public.increment_ai_question_usage() from anon;
revoke execute on function public.current_user_email() from anon;
revoke execute on function public.get_user_email_safe(uuid) from anon;

revoke execute on function public.accept_family_invite(text) from anon;
revoke execute on function public.claim_lawyer_invite(text) from anon;
revoke execute on function public.regenerate_lawyer_invite(uuid) from anon;

revoke execute on function public.client_accept_request(uuid) from anon;
revoke execute on function public.client_decline_request(uuid) from anon;
revoke execute on function public.client_pending_requests() from anon;
revoke execute on function public.client_connect_to_lawyer(uuid, boolean) from anon;
revoke execute on function public.client_revoke_lawyer_access(uuid) from anon;
revoke execute on function public.client_unlink_from_lawyer(uuid) from anon;
revoke execute on function public.client_escalate_to_lawyer(uuid, text) from anon;
revoke execute on function public.client_cancel_escalation(uuid) from anon;

revoke execute on function public.lawyer_request_client(text, text, text) from anon;
revoke execute on function public.lawyer_revoke_request(uuid) from anon;
revoke execute on function public.lawyer_unlink_client(uuid) from anon;
revoke execute on function public.lawyer_delete_client(uuid) from anon;
revoke execute on function public.lawyer_clear_escalation(uuid) from anon;

-- ── Триггерные функции: прямой вызов не предусмотрен ─────────────────────
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user_subscription() from anon, authenticated;
revoke execute on function public.enforce_document_upload_quota() from anon, authenticated;
revoke execute on function public.update_updated_at_column() from anon, authenticated;
