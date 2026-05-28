-- ============================================================================
-- P2-12: переиспользование карточки + выход из тупика «declined».
--
-- lawyer_request_client всегда делал INSERT — повторный запрос тому же клиенту
-- (по email/аккаунту) плодил дубли, а карточка в состоянии 'declined' не имела
-- пути назад. Теперь:
--   • если карточка этого клиента у юриста уже есть и она linked_active или
--     pending — возвращаем её, дубль не создаём;
--   • если она в code_sent / declined / archived / unlinked* — РЕАНИМИРУЕМ ту же
--     карточку (новый запрос/код), история сохраняется;
--   • если карточки нет — создаём новую (прежнее поведение).
-- client_user_id не трогаем, чтобы не конфликтовать с sync_link_state_on_update.
-- ============================================================================

CREATE OR REPLACE FUNCTION lawyer_request_client(
  p_client_name  TEXT,
  p_target_email TEXT DEFAULT NULL,
  p_client_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  lawyer_client_id UUID,
  link_state TEXT,
  invite_code TEXT,
  found_account BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_target_uid  UUID;
  v_new_id      UUID := gen_random_uuid();
  v_invite_code TEXT;
  v_state       TEXT;
  v_email_norm  TEXT := NULLIF(lower(trim(coalesce(p_target_email, ''))), '');
  v_existing    lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;
  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RAISE EXCEPTION 'Имя клиента обязательно';
  END IF;

  IF v_email_norm IS NOT NULL THEN
    SELECT id INTO v_target_uid
    FROM auth.users
    WHERE lower(email) = v_email_norm
    LIMIT 1;
  END IF;

  -- Уже есть карточка этого клиента у этого юриста? (по аккаунту или email)
  SELECT * INTO v_existing
  FROM lawyer_clients
  WHERE lawyer_id = v_uid
    AND (
      (v_target_uid IS NOT NULL AND client_user_id = v_target_uid)
      OR (v_email_norm IS NOT NULL AND lower(target_email) = v_email_norm)
      OR (v_email_norm IS NOT NULL AND lower(client_email) = v_email_norm)
    )
  ORDER BY
    CASE link_state
      WHEN 'linked_active'           THEN 0
      WHEN 'pending_client_approval' THEN 1
      WHEN 'code_sent'               THEN 2
      ELSE 3
    END,
    updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Уже связаны или запрос в ожидании — дубль не плодим.
    IF v_existing.link_state IN ('linked_active', 'pending_client_approval') THEN
      RETURN QUERY SELECT v_existing.id, v_existing.link_state,
                          v_existing.invite_code,
                          (v_existing.client_user_id IS NOT NULL);
      RETURN;
    END IF;

    -- code_sent / declined / archived / unlinked* — реанимируем ту же карточку.
    IF v_target_uid IS NOT NULL THEN
      v_state := 'pending_client_approval';
      UPDATE lawyer_clients SET
        client_name  = trim(p_client_name),
        client_email = coalesce(NULLIF(trim(coalesce(p_target_email, '')), ''), client_email),
        client_phone = coalesce(p_client_phone, client_phone),
        target_email = v_email_norm,
        link_state   = v_state,
        invite_code  = NULL,
        requested_at = now(),
        unlinked_at  = NULL,
        unlinked_by  = NULL,
        updated_at   = now()
      WHERE id = v_existing.id;
      RETURN QUERY SELECT v_existing.id, v_state, NULL::TEXT, true;
    ELSE
      v_invite_code := generate_lawyer_invite_code();
      v_state := 'code_sent';
      UPDATE lawyer_clients SET
        client_name  = trim(p_client_name),
        client_email = NULLIF(trim(coalesce(p_target_email, '')), ''),
        client_phone = coalesce(p_client_phone, client_phone),
        target_email = v_email_norm,
        link_state   = v_state,
        invite_code  = v_invite_code,
        requested_at = now(),
        unlinked_at  = NULL,
        unlinked_by  = NULL,
        updated_at   = now()
      WHERE id = v_existing.id;
      RETURN QUERY SELECT v_existing.id, v_state, v_invite_code, false;
    END IF;
    RETURN;
  END IF;

  -- Карточки нет — создаём новую (прежнее поведение).
  IF v_target_uid IS NOT NULL THEN
    v_state := 'pending_client_approval';
    INSERT INTO lawyer_clients (
      id, lawyer_id, client_user_id, client_name, client_email,
      client_phone, crm_stage, priority,
      link_state, requested_at, target_email
    ) VALUES (
      v_new_id, v_uid, NULL, trim(p_client_name), trim(p_target_email),
      p_client_phone, 'initial_contact', 'normal',
      v_state, now(), v_email_norm
    );
    RETURN QUERY SELECT v_new_id, v_state, NULL::TEXT, true;
  ELSE
    v_invite_code := generate_lawyer_invite_code();
    v_state := 'code_sent';
    INSERT INTO lawyer_clients (
      id, lawyer_id, client_user_id, client_name, client_email,
      client_phone, crm_stage, priority,
      invite_code, link_state, requested_at, target_email
    ) VALUES (
      v_new_id, v_uid, NULL, trim(p_client_name),
      NULLIF(trim(coalesce(p_target_email, '')), ''),
      p_client_phone, 'initial_contact', 'normal',
      v_invite_code, v_state, now(), v_email_norm
    );
    RETURN QUERY SELECT v_new_id, v_state, v_invite_code, false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION lawyer_request_client(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_request_client(TEXT, TEXT, TEXT) TO authenticated;
