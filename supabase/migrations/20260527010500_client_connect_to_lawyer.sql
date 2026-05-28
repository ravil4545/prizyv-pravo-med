-- ============================================================================
-- Клиент сам подключается к юристу из каталога /lawyers.
--
-- Прежде LawyersDirectoryPage делал прямой INSERT в lawyer_clients от имени
-- клиента — но RLS-политика «Lawyer manages own clients» разрешает запись
-- только юристу (auth.uid() = lawyer_id). От клиента INSERT падал.
--
-- Решение: SECURITY DEFINER RPC. Клиент инициирует связь, БД создаёт карточку
-- от своего имени, опционально сразу открывает доступ к документам/профилю/ИИ.
-- ============================================================================

CREATE OR REPLACE FUNCTION client_connect_to_lawyer(
  p_lawyer_id UUID,
  p_grant_access BOOLEAN DEFAULT true
)
RETURNS TABLE (
  lawyer_client_id UUID,
  access_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
  v_client_name TEXT;
  v_new_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  IF p_lawyer_id IS NULL THEN RAISE EXCEPTION 'Не указан юрист'; END IF;
  IF p_lawyer_id = v_uid THEN RAISE EXCEPTION 'Нельзя подключиться к самому себе'; END IF;

  -- Проверяем, что это реальный активный юрист
  IF NOT EXISTS (
    SELECT 1 FROM lawyer_profiles
    WHERE user_id = p_lawyer_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Юрист не найден или неактивен';
  END IF;

  -- Имя для карточки: реальное ФИО раскрываем только если клиент сразу даёт
  -- доступ (значит согласен). Иначе — обезличенно, до открытия доступа.
  SELECT full_name INTO v_client_name FROM profiles WHERE id = v_uid;
  IF v_client_name IS NULL OR length(trim(v_client_name)) = 0 OR NOT p_grant_access THEN
    v_client_name := 'Клиент #' || substr(v_uid::text, 1, 8);
  END IF;

  -- Уже есть карточка этого клиента у этого юриста?
  SELECT * INTO v_row
  FROM lawyer_clients
  WHERE lawyer_id = p_lawyer_id AND client_user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    v_new_id := v_row.id;
    -- Реанимируем, если была отвязана
    UPDATE lawyer_clients
    SET link_state = 'linked_active',
        linked_at = COALESCE(linked_at, now()),
        unlinked_at = NULL,
        unlinked_by = NULL,
        updated_at = now()
    WHERE id = v_new_id;
  ELSE
    v_new_id := gen_random_uuid();
    INSERT INTO lawyer_clients (
      id, lawyer_id, client_user_id, client_name,
      crm_stage, priority, link_state, linked_at
    ) VALUES (
      v_new_id, p_lawyer_id, v_uid, v_client_name,
      'initial_contact', 'high', 'linked_active', now()
    );
  END IF;

  -- Доступ к меддокам/профилю/ИИ
  INSERT INTO client_document_access (client_user_id, lawyer_id, is_active)
  VALUES (v_uid, p_lawyer_id, p_grant_access)
  ON CONFLICT (client_user_id, lawyer_id) DO UPDATE SET is_active = p_grant_access;

  RETURN QUERY SELECT v_new_id, p_grant_access;
END;
$$;

REVOKE ALL ON FUNCTION client_connect_to_lawyer(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_connect_to_lawyer(UUID, BOOLEAN) TO authenticated;

-- Закрыть доступ конкретному юристу (тумблер OFF). Связь остаётся, юрист
-- просто теряет доступ к документам/профилю/ИИ.
CREATE OR REPLACE FUNCTION client_revoke_lawyer_access(p_lawyer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;

  UPDATE client_document_access
  SET is_active = false
  WHERE client_user_id = v_uid AND lawyer_id = p_lawyer_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION client_revoke_lawyer_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_revoke_lawyer_access(UUID) TO authenticated;
