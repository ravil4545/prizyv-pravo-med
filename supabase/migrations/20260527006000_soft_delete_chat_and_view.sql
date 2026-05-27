-- ============================================================================
-- Soft-delete для чата + VIEW lawyer_clients_enriched.
--
-- ПРОБЛЕМА: при lawyer_delete_client каскадом улетают все lawyer_chat_messages.
-- Клиент теряет историю диалога. С новой soft-archive логикой удаление
-- карточки только ставит link_state='archived' — но FK CASCADE никуда не делся.
--
-- ФИКС: меняем FK на ON DELETE SET NULL — историческое сообщение сохраняется
-- с lawyer_client_id=NULL, доступ к нему остаётся только у его автора
-- (sender_id). Это безопасный фолбэк на случай если кто-то вызовет
-- DELETE FROM lawyer_clients напрямую (минуя soft-archive).
--
-- VIEW lawyer_clients_enriched: один источник имени клиента — для всего UI.
-- ============================================================================


-- ── 1. Меняем CASCADE → SET NULL для lawyer_chat_messages ──
-- (если уже SET NULL — просто сработает DROP без эффекта)
ALTER TABLE lawyer_chat_messages
  DROP CONSTRAINT IF EXISTS lawyer_chat_messages_lawyer_client_id_fkey;

ALTER TABLE lawyer_chat_messages
  ADD CONSTRAINT lawyer_chat_messages_lawyer_client_id_fkey
  FOREIGN KEY (lawyer_client_id) REFERENCES lawyer_clients(id)
  ON DELETE SET NULL;

-- Аналогично для case_notes — заметки тоже сохраняем при удалении карточки
ALTER TABLE case_notes
  DROP CONSTRAINT IF EXISTS case_notes_lawyer_client_id_fkey;

ALTER TABLE case_notes
  ADD CONSTRAINT case_notes_lawyer_client_id_fkey
  FOREIGN KEY (lawyer_client_id) REFERENCES lawyer_clients(id)
  ON DELETE SET NULL;

-- ── 2. RPC: безопасное чтение email юзера для VIEW ──
-- VIEW не может вызывать SECURITY DEFINER функции напрямую в WHERE, поэтому
-- делаем helper-функцию, которая возвращает email для UUID (если есть права).
CREATE OR REPLACE FUNCTION public.get_user_email_safe(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_email TEXT;
  v_is_lawyer_of_client BOOLEAN;
BEGIN
  IF v_caller IS NULL OR p_user_id IS NULL THEN RETURN NULL; END IF;

  -- Право видеть email есть:
  --   • у самого юзера (свой email);
  --   • у юриста, в чьей CRM этот клиент;
  --   • у клиента, привязанного к юристу-владельцу (если запрашиваем email юриста).
  IF v_caller = p_user_id THEN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    RETURN v_email;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM lawyer_clients
    WHERE lawyer_id = v_caller AND client_user_id = p_user_id
  ) INTO v_is_lawyer_of_client;

  IF v_is_lawyer_of_client THEN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    RETURN v_email;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_email_safe(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_email_safe(UUID) TO authenticated;

-- ── 3. VIEW lawyer_clients_enriched ──
-- Цель: один источник имени клиента для UI. UI выбирает первое непустое:
--   1) display_override (если юрист переименовал в CRM, не вида «Клиент #...»);
--   2) profile_full_name;
--   3) auth_email (если доступен);
--   4) фолбэк «Клиент #<8 симв.>» (на крайний случай).
DROP VIEW IF EXISTS public.lawyer_clients_enriched;
CREATE VIEW public.lawyer_clients_enriched
WITH (security_invoker = true) AS
SELECT
  lc.*,
  p.full_name AS profile_full_name,
  public.get_user_email_safe(lc.client_user_id) AS client_auth_email,
  COALESCE(
    NULLIF(CASE WHEN lc.client_name LIKE 'Клиент #%' THEN NULL ELSE lc.client_name END, ''),
    NULLIF(p.full_name, ''),
    public.get_user_email_safe(lc.client_user_id),
    lc.client_name
  ) AS display_name
FROM lawyer_clients lc
LEFT JOIN profiles p ON p.id = lc.client_user_id;

GRANT SELECT ON public.lawyer_clients_enriched TO authenticated;

-- ── 4. Realtime для lawyer_clients уже подключён в предыдущей миграции,
-- VIEW не нуждается в отдельной подписке — изменения в нём подтянутся
-- через подписку на underlying-таблицу.
