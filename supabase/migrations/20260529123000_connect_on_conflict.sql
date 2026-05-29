-- ============================================================================
-- P1: client_connect_to_lawyer — идемпотентность под новый UNIQUE-индекс.
--
-- После 20260529122000 на lawyer_clients висит частичный UNIQUE
-- (lawyer_id, client_user_id) WHERE client_user_id IS NOT NULL. SELECT…THEN…INSERT
-- в этой функции не атомарен: при гонке два параллельных вызова могли пройти
-- ветку «карточки нет» и оба сделать INSERT → второй упал бы с unique_violation.
--
-- Делаем INSERT идемпотентным: ON CONFLICT по тому же частичному индексу
-- реанимирует существующую карточку (как ветка FOUND), а не падает.
-- Остальная логика (проверка clients_limit, only-upgrade доступа) — как в
-- 20260528125000.
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
  v_limit INT;
  v_active INT;
  v_access_now BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  IF p_lawyer_id IS NULL THEN RAISE EXCEPTION 'Не указан юрист'; END IF;
  IF p_lawyer_id = v_uid THEN RAISE EXCEPTION 'Нельзя подключиться к самому себе'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lawyer_profiles
    WHERE user_id = p_lawyer_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Юрист не найден или неактивен';
  END IF;

  SELECT full_name INTO v_client_name FROM profiles WHERE id = v_uid;
  IF v_client_name IS NULL OR length(trim(v_client_name)) = 0 OR NOT p_grant_access THEN
    v_client_name := 'Клиент #' || substr(v_uid::text, 1, 8);
  END IF;

  SELECT * INTO v_row
  FROM lawyer_clients
  WHERE lawyer_id = p_lawyer_id AND client_user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    v_new_id := v_row.id;
    UPDATE lawyer_clients
    SET link_state = 'linked_active',
        linked_at = COALESCE(linked_at, now()),
        unlinked_at = NULL,
        unlinked_by = NULL,
        updated_at = now()
    WHERE id = v_new_id;
  ELSE
    SELECT clients_limit INTO v_limit FROM lawyer_profiles WHERE user_id = p_lawyer_id;
    SELECT count(*) INTO v_active
    FROM lawyer_clients
    WHERE lawyer_id = p_lawyer_id
      AND link_state NOT IN ('archived', 'declined', 'unlinked', 'unlinked_by_client', 'unlinked_by_lawyer');
    IF v_limit IS NOT NULL AND v_active >= v_limit THEN
      RAISE EXCEPTION 'У выбранного юриста заполнен лимит клиентов по тарифу. Попробуйте связаться с ним напрямую или выберите другого юриста.';
    END IF;

    v_new_id := gen_random_uuid();
    -- Идемпотентно: при гонке (карточка уже создана параллельно) — реанимируем её.
    INSERT INTO lawyer_clients (
      id, lawyer_id, client_user_id, client_name,
      crm_stage, priority, link_state, linked_at
    ) VALUES (
      v_new_id, p_lawyer_id, v_uid, v_client_name,
      'initial_contact', 'high', 'linked_active', now()
    )
    ON CONFLICT (lawyer_id, client_user_id) WHERE client_user_id IS NOT NULL
    DO UPDATE SET
      link_state  = 'linked_active',
      linked_at   = COALESCE(lawyer_clients.linked_at, now()),
      unlinked_at = NULL,
      unlinked_by = NULL,
      updated_at  = now()
    RETURNING id INTO v_new_id;
  END IF;

  -- Доступ только ПОВЫШАЕМ (понизить можно лишь явным revoke).
  INSERT INTO client_document_access (client_user_id, lawyer_id, is_active)
  VALUES (v_uid, p_lawyer_id, p_grant_access)
  ON CONFLICT (client_user_id, lawyer_id)
    DO UPDATE SET is_active = client_document_access.is_active OR EXCLUDED.is_active
  RETURNING is_active INTO v_access_now;

  RETURN QUERY SELECT v_new_id, COALESCE(v_access_now, p_grant_access);
END;
$$;

REVOKE ALL ON FUNCTION client_connect_to_lawyer(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_connect_to_lawyer(UUID, BOOLEAN) TO authenticated;
