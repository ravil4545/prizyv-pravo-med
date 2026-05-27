-- Отвязка клиент↔юрист — двусторонние RPC.
--
-- Симметричный набор:
--   • client_unlink_from_lawyer(p_lawyer_client_id) — клиент решает порвать связь.
--     Карточка остаётся у юриста как «анонимная» CRM-запись (история дела не
--     теряется), но: client_user_id → NULL, access → is_active = false,
--     генерируется новый invite_code, чтобы юрист мог пригласить снова.
--
--   • lawyer_unlink_client(p_lawyer_client_id) — юрист отвязывает аккаунт,
--     карточку оставляет. Симметрично client_unlink_from_lawyer.
--
--   • lawyer_delete_client(p_lawyer_client_id) — юрист удаляет карточку целиком,
--     каскадом улетают case_notes / chat_messages / template_uses / med_docs.
--
-- Все три — SECURITY DEFINER: проверяют, что caller является stakeholder'ом
-- (либо юрист-владелец карточки, либо привязанный клиент), и от имени БД
-- делают UPDATE/DELETE через RLS юриста.

-- ── 1. client_unlink_from_lawyer ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION client_unlink_from_lawyer(p_lawyer_client_id UUID)
RETURNS TABLE (
  lawyer_client_id UUID,
  new_invite_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
  v_new_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Карточка не найдена';
  END IF;

  IF v_row.client_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Эта карточка не привязана к вам';
  END IF;

  -- Сразу выбираем новый invite_code, чтобы юрист мог пригласить снова
  v_new_code := generate_lawyer_invite_code();

  UPDATE lawyer_clients
  SET client_user_id = NULL,
      invite_code = v_new_code,
      updated_at = now()
  WHERE id = p_lawyer_client_id;

  -- Закрываем доступ к меддокам / ИИ-анализам этого юриста
  UPDATE client_document_access
  SET is_active = false
  WHERE client_user_id = v_uid AND lawyer_id = v_row.lawyer_id;

  RETURN QUERY SELECT p_lawyer_client_id, v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION client_unlink_from_lawyer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_unlink_from_lawyer(UUID) TO authenticated;

-- ── 2. lawyer_unlink_client ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lawyer_unlink_client(p_lawyer_client_id UUID)
RETURNS TABLE (
  lawyer_client_id UUID,
  new_invite_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
  v_new_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Клиент не найден';
  END IF;

  IF v_row.lawyer_id <> v_uid THEN
    RAISE EXCEPTION 'Нет доступа: эта карточка не ваша';
  END IF;

  IF v_row.client_user_id IS NULL THEN
    RAISE EXCEPTION 'Клиент и так не привязан';
  END IF;

  v_new_code := generate_lawyer_invite_code();

  UPDATE lawyer_clients
  SET client_user_id = NULL,
      invite_code = v_new_code,
      updated_at = now()
  WHERE id = p_lawyer_client_id;

  -- Снимаем доступ юриста к меддокам клиента (симметрично)
  UPDATE client_document_access
  SET is_active = false
  WHERE client_user_id = v_row.client_user_id AND lawyer_id = v_uid;

  RETURN QUERY SELECT p_lawyer_client_id, v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION lawyer_unlink_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_unlink_client(UUID) TO authenticated;

-- ── 3. lawyer_delete_client ──────────────────────────────────────────────
-- Полное удаление карточки. Каскадом снимаются case_notes / lawyer_chat_messages
-- / lawyer_template_uses / lawyer_client_med_docs (ON DELETE CASCADE заданы
-- в исходных миграциях).
-- Также деактивируем client_document_access — на случай если клиент был
-- привязан (cascade его не уберёт, потому что доступ привязан к client_user_id,
-- а не к lawyer_client_id).
CREATE OR REPLACE FUNCTION lawyer_delete_client(p_lawyer_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Клиент не найден';
  END IF;

  IF v_row.lawyer_id <> v_uid THEN
    RAISE EXCEPTION 'Нет доступа: эта карточка не ваша';
  END IF;

  IF v_row.client_user_id IS NOT NULL THEN
    UPDATE client_document_access
    SET is_active = false
    WHERE client_user_id = v_row.client_user_id AND lawyer_id = v_uid;
  END IF;

  DELETE FROM lawyer_clients WHERE id = p_lawyer_client_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION lawyer_delete_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_delete_client(UUID) TO authenticated;
