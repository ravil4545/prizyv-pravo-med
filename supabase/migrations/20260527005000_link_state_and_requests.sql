-- ============================================================================
-- Единая модель связи клиент↔юрист.
--
-- ПРОБЛЕМЫ ДО:
--   • 4 пути создания записи (юрист, autoAttach, claim_invite, старый UUID),
--     отсюда «Клиент #b2ce22eb» и «сомнительные привязки».
--   • Два независимых флага (lawyer_clients.client_user_id +
--     client_document_access.is_active) разъезжаются.
--   • Нет аудита: кто разорвал связь, когда, по какой причине.
--   • Нет approval-flow от юриста (только клиент сам вводит код).
--
-- ПОСЛЕ:
--   • Один enum link_state (8 значений), все переходы — через RPC.
--   • linked_at/unlinked_at/unlinked_by — аудит.
--   • requested_at + target_email — поддержка «юрист отправил запрос → клиент
--     принимает одной кнопкой».
--   • Доступ к меддокам/AI остаётся в client_document_access — но управляется
--     одним switch'ем синхронно со link_state (триггер).
-- ============================================================================


-- ── 1. Новые колонки в lawyer_clients ─────────────────────────────────────
ALTER TABLE lawyer_clients
  ADD COLUMN IF NOT EXISTS link_state   TEXT NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS linked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlinked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlinked_by  TEXT,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_email TEXT;

-- Проверка-белый список значений (не FK на отдельную таблицу — компактнее)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lawyer_clients_link_state_check'
  ) THEN
    ALTER TABLE lawyer_clients
      ADD CONSTRAINT lawyer_clients_link_state_check
      CHECK (link_state IN (
        'unlinked',                  -- ничего нет (только-только создана)
        'code_sent',                 -- юрист сгенерил invite_code, ждём ввода
        'pending_client_approval',   -- юрист отправил запрос аккаунту, ждём accept
        'linked_active',             -- клиент принял, связь живая
        'declined',                  -- клиент отклонил запрос
        'unlinked_by_client',        -- клиент сам отвязался
        'unlinked_by_lawyer',        -- юрист сам отвязался
        'archived'                   -- юрист удалил карточку (soft-delete)
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lawyer_clients_unlinked_by_check'
  ) THEN
    ALTER TABLE lawyer_clients
      ADD CONSTRAINT lawyer_clients_unlinked_by_check
      CHECK (unlinked_by IS NULL OR unlinked_by IN ('client', 'lawyer'));
  END IF;
END $$;

-- Индексы под основные UI-запросы
CREATE INDEX IF NOT EXISTS idx_lawyer_clients_link_state
  ON lawyer_clients(link_state);
CREATE INDEX IF NOT EXISTS idx_lawyer_clients_target_email
  ON lawyer_clients(target_email) WHERE target_email IS NOT NULL;

-- ── 2. Бэкфилл существующих записей ───────────────────────────────────────
-- Текущая ситуация: если client_user_id заполнен — считаем linked_active,
-- иначе code_sent (если есть invite_code) либо unlinked.
UPDATE lawyer_clients
SET
  link_state = CASE
    WHEN client_user_id IS NOT NULL THEN 'linked_active'
    WHEN invite_code IS NOT NULL    THEN 'code_sent'
    ELSE 'unlinked'
  END,
  linked_at = CASE WHEN client_user_id IS NOT NULL THEN COALESCE(linked_at, created_at) ELSE linked_at END
WHERE link_state = 'unlinked';

-- ── 3. Триггер sync_link_state — синхронизирует link_state с фактическими
--      изменениями client_user_id / client_document_access.is_active.
-- Главная цель: invariant «один источник правды».
CREATE OR REPLACE FUNCTION sync_link_state_on_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Если кто-то поставил client_user_id в обход RPC — поднимаем в linked_active
  IF NEW.client_user_id IS NOT NULL AND OLD.client_user_id IS NULL THEN
    IF NEW.link_state NOT IN ('linked_active') THEN
      NEW.link_state := 'linked_active';
      NEW.linked_at := COALESCE(NEW.linked_at, now());
      NEW.unlinked_at := NULL;
      NEW.unlinked_by := NULL;
    END IF;
  END IF;

  -- Если client_user_id обнулили — переводим в unlinked (более точное состояние
  -- проставит RPC, который инициировал отвязку, через DEFAULT-аргумент).
  IF NEW.client_user_id IS NULL AND OLD.client_user_id IS NOT NULL THEN
    IF NEW.link_state IN ('linked_active', 'code_sent', 'pending_client_approval') THEN
      NEW.link_state := 'unlinked';
      NEW.unlinked_at := COALESCE(NEW.unlinked_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lawyer_clients_sync_link_state ON lawyer_clients;
CREATE TRIGGER trg_lawyer_clients_sync_link_state
  BEFORE UPDATE ON lawyer_clients
  FOR EACH ROW EXECUTE FUNCTION sync_link_state_on_update();

-- ── 4. RPC: юрист отправляет запрос клиенту по email ──────────────────────
-- Если email привязан к зарегистрированному аккаунту — карточка появится
-- у клиента в кабинете как «Запрос на подключение» с кнопками Accept/Decline.
-- Если нет — генерируется invite_code, юрист сможет отправить его клиенту вручную.
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
  v_uid UUID := auth.uid();
  v_target_uid UUID;
  v_new_id UUID := gen_random_uuid();
  v_invite_code TEXT;
  v_state TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;
  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RAISE EXCEPTION 'Имя клиента обязательно';
  END IF;

  -- Ищем зарегистрированного юзера по email (через auth.users).
  -- SECURITY DEFINER даёт нам доступ к auth.users, фронту — нет.
  IF p_target_email IS NOT NULL AND length(trim(p_target_email)) > 0 THEN
    SELECT id INTO v_target_uid
    FROM auth.users
    WHERE lower(email) = lower(trim(p_target_email))
    LIMIT 1;
  END IF;

  IF v_target_uid IS NOT NULL THEN
    -- Email известен сайту — отправляем запрос-приглашение, ждём accept.
    v_state := 'pending_client_approval';
    INSERT INTO lawyer_clients (
      id, lawyer_id, client_user_id, client_name, client_email,
      client_phone, crm_stage, priority,
      link_state, requested_at, target_email
    ) VALUES (
      v_new_id, v_uid, NULL, trim(p_client_name), trim(p_target_email),
      p_client_phone, 'initial_contact', 'normal',
      v_state, now(), lower(trim(p_target_email))
    );
    RETURN QUERY SELECT v_new_id, v_state, NULL::TEXT, true;
  ELSE
    -- Email неизвестен (или не указан) — старый flow с кодом-инвайтом.
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
      v_invite_code, v_state, now(),
      NULLIF(lower(trim(coalesce(p_target_email, ''))), '')
    );
    RETURN QUERY SELECT v_new_id, v_state, v_invite_code, false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION lawyer_request_client(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_request_client(TEXT, TEXT, TEXT) TO authenticated;

-- ── 5. RPC: клиент получает список pending-запросов ───────────────────────
-- Возвращает все карточки с link_state = 'pending_client_approval', где
-- target_email = email текущего пользователя (или client_user_id уже подставлен).
CREATE OR REPLACE FUNCTION client_pending_requests()
RETURNS TABLE (
  lawyer_client_id UUID,
  lawyer_id UUID,
  lawyer_name TEXT,
  lawyer_specialization TEXT,
  lawyer_photo_url TEXT,
  requested_at TIMESTAMPTZ,
  client_name_in_crm TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  RETURN QUERY
  SELECT
    lc.id,
    lc.lawyer_id,
    lp.full_name,
    lp.specialization,
    lp.photo_url,
    lc.requested_at,
    lc.client_name
  FROM lawyer_clients lc
  LEFT JOIN lawyer_profiles lp ON lp.user_id = lc.lawyer_id
  WHERE lc.link_state = 'pending_client_approval'
    AND (
      lc.client_user_id = v_uid
      OR (v_email IS NOT NULL AND lower(lc.target_email) = v_email)
    )
  ORDER BY lc.requested_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION client_pending_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_pending_requests() TO authenticated;

-- ── 6. RPC: клиент принимает запрос ──────────────────────────────────────
CREATE OR REPLACE FUNCTION client_accept_request(p_lawyer_client_id UUID)
RETURNS TABLE (
  lawyer_client_id UUID,
  lawyer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_row lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запрос не найден'; END IF;
  IF v_row.link_state <> 'pending_client_approval' THEN
    RAISE EXCEPTION 'Запрос больше не активен';
  END IF;

  -- Право принять есть только у получателя запроса
  IF v_row.client_user_id IS NOT NULL AND v_row.client_user_id <> v_uid THEN
    RAISE EXCEPTION 'Этот запрос адресован другому пользователю';
  END IF;
  IF v_row.client_user_id IS NULL AND (v_email IS NULL OR lower(v_row.target_email) <> v_email) THEN
    RAISE EXCEPTION 'Этот запрос адресован другому email';
  END IF;

  UPDATE lawyer_clients
  SET
    client_user_id = v_uid,
    link_state = 'linked_active',
    linked_at = now(),
    unlinked_at = NULL,
    unlinked_by = NULL,
    invite_code = NULL,
    updated_at = now()
  WHERE id = p_lawyer_client_id;

  -- Открываем доступ к меддокам/AI одной транзакцией
  INSERT INTO client_document_access (client_user_id, lawyer_id, is_active)
  VALUES (v_uid, v_row.lawyer_id, true)
  ON CONFLICT (client_user_id, lawyer_id) DO UPDATE SET is_active = true;

  RETURN QUERY SELECT v_row.id, v_row.lawyer_id;
END;
$$;

REVOKE ALL ON FUNCTION client_accept_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_accept_request(UUID) TO authenticated;

-- ── 7. RPC: клиент отклоняет запрос ──────────────────────────────────────
CREATE OR REPLACE FUNCTION client_decline_request(p_lawyer_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_row lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запрос не найден'; END IF;
  IF v_row.link_state <> 'pending_client_approval' THEN
    RAISE EXCEPTION 'Запрос больше не активен';
  END IF;
  IF v_row.client_user_id IS NOT NULL AND v_row.client_user_id <> v_uid THEN
    RAISE EXCEPTION 'Этот запрос адресован другому пользователю';
  END IF;
  IF v_row.client_user_id IS NULL AND (v_email IS NULL OR lower(v_row.target_email) <> v_email) THEN
    RAISE EXCEPTION 'Этот запрос адресован другому email';
  END IF;

  UPDATE lawyer_clients
  SET link_state = 'declined', updated_at = now()
  WHERE id = p_lawyer_client_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION client_decline_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_decline_request(UUID) TO authenticated;

-- ── 8. Обновляем claim_lawyer_invite — теперь ставит link_state. ─────────
CREATE OR REPLACE FUNCTION claim_lawyer_invite(p_code TEXT)
RETURNS TABLE (
  lawyer_client_id UUID,
  lawyer_id UUID,
  client_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Введите код приглашения';
  END IF;

  p_code := upper(replace(p_code, ' ', ''));
  SELECT * INTO v_row FROM lawyer_clients WHERE invite_code = p_code LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'Код не найден или уже использован'; END IF;
  IF v_row.client_user_id IS NOT NULL THEN RAISE EXCEPTION 'Это приглашение уже использовано'; END IF;
  IF v_row.lawyer_id = v_uid THEN RAISE EXCEPTION 'Нельзя привязаться к собственной карточке'; END IF;

  UPDATE lawyer_clients
  SET
    client_user_id = v_uid,
    invite_code = NULL,
    link_state = 'linked_active',
    linked_at = now(),
    unlinked_at = NULL,
    unlinked_by = NULL,
    updated_at = now()
  WHERE id = v_row.id;

  INSERT INTO client_document_access (client_user_id, lawyer_id, is_active)
  VALUES (v_uid, v_row.lawyer_id, true)
  ON CONFLICT (client_user_id, lawyer_id) DO UPDATE SET is_active = true;

  RETURN QUERY SELECT v_row.id, v_row.lawyer_id, v_row.client_name;
END;
$$;
REVOKE ALL ON FUNCTION claim_lawyer_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_lawyer_invite(TEXT) TO authenticated;

-- ── 9. Обновлённые unlink-RPC — ставят корректный link_state ─────────────
CREATE OR REPLACE FUNCTION client_unlink_from_lawyer(p_lawyer_client_id UUID)
RETURNS TABLE (lawyer_client_id UUID, new_invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
  v_new_code TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Карточка не найдена'; END IF;
  IF v_row.client_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Эта карточка не привязана к вам';
  END IF;

  v_new_code := generate_lawyer_invite_code();

  UPDATE lawyer_clients
  SET
    client_user_id = NULL,
    invite_code = v_new_code,
    link_state = 'unlinked_by_client',
    unlinked_at = now(),
    unlinked_by = 'client',
    updated_at = now()
  WHERE id = p_lawyer_client_id;

  UPDATE client_document_access
  SET is_active = false
  WHERE client_user_id = v_uid AND lawyer_id = v_row.lawyer_id;

  RETURN QUERY SELECT p_lawyer_client_id, v_new_code;
END;
$$;
REVOKE ALL ON FUNCTION client_unlink_from_lawyer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_unlink_from_lawyer(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION lawyer_unlink_client(p_lawyer_client_id UUID)
RETURNS TABLE (lawyer_client_id UUID, new_invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
  v_new_code TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Клиент не найден'; END IF;
  IF v_row.lawyer_id <> v_uid THEN
    RAISE EXCEPTION 'Нет доступа: эта карточка не ваша';
  END IF;
  IF v_row.client_user_id IS NULL THEN
    RAISE EXCEPTION 'Клиент и так не привязан';
  END IF;

  v_new_code := generate_lawyer_invite_code();

  UPDATE lawyer_clients
  SET
    client_user_id = NULL,
    invite_code = v_new_code,
    link_state = 'unlinked_by_lawyer',
    unlinked_at = now(),
    unlinked_by = 'lawyer',
    updated_at = now()
  WHERE id = p_lawyer_client_id;

  UPDATE client_document_access
  SET is_active = false
  WHERE client_user_id = v_row.client_user_id AND lawyer_id = v_uid;

  RETURN QUERY SELECT p_lawyer_client_id, v_new_code;
END;
$$;
REVOKE ALL ON FUNCTION lawyer_unlink_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_unlink_client(UUID) TO authenticated;

-- lawyer_delete_client → soft-archive вместо хард-delete:
CREATE OR REPLACE FUNCTION lawyer_delete_client(p_lawyer_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row lawyer_clients%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;
  SELECT * INTO v_row FROM lawyer_clients WHERE id = p_lawyer_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Клиент не найден'; END IF;
  IF v_row.lawyer_id <> v_uid THEN
    RAISE EXCEPTION 'Нет доступа: эта карточка не ваша';
  END IF;

  -- Закрываем доступ к меддокам, если был
  IF v_row.client_user_id IS NOT NULL THEN
    UPDATE client_document_access
    SET is_active = false
    WHERE client_user_id = v_row.client_user_id AND lawyer_id = v_uid;
  END IF;

  -- Soft-delete: переводим в archived. История чата и заметки сохраняются.
  -- Реальный DELETE FROM lawyer_clients оставляем только для админ-инструмента.
  UPDATE lawyer_clients
  SET
    link_state = 'archived',
    client_user_id = NULL,
    invite_code = NULL,
    unlinked_at = now(),
    unlinked_by = 'lawyer',
    updated_at = now()
  WHERE id = p_lawyer_client_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION lawyer_delete_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_delete_client(UUID) TO authenticated;

-- ── 10. Доп. RPC: юрист повторно отправляет запрос или регенерирует код ─
CREATE OR REPLACE FUNCTION lawyer_revoke_request(p_lawyer_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;

  UPDATE lawyer_clients
  SET
    link_state = 'archived',
    invite_code = NULL,
    target_email = NULL,
    updated_at = now()
  WHERE id = p_lawyer_client_id
    AND lawyer_id = v_uid
    AND link_state IN ('pending_client_approval', 'code_sent', 'declined');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Запрос не найден или уже выполнен';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION lawyer_revoke_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_revoke_request(UUID) TO authenticated;

-- ── 11. Право клиента видеть pending-карточки, адресованные ему по email ─
-- Текущая RLS-политика «Client views own lawyer entry» проверяет только
-- client_user_id. Для pending-запросов client_user_id может быть NULL
-- (юрист пригласил по email, привязки ещё нет). Дополняем политику.
DROP POLICY IF EXISTS "Client views own lawyer entry" ON lawyer_clients;
CREATE POLICY "Client views own lawyer entry" ON lawyer_clients
  FOR SELECT USING (
    auth.uid() = client_user_id
    OR (
      link_state = 'pending_client_approval'
      AND target_email IS NOT NULL
      AND target_email = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
    )
  );

-- Realtime — pending запросы тоже должны прилетать клиенту в реал-тайме:
ALTER TABLE public.lawyer_clients REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lawyer_clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lawyer_clients;
  END IF;
END $$;

-- ── 12. Триггер sync_client_name — обновляет «Клиент #abc...» на реальное ─
-- ФИО, как только триггер create_profile создаёт profiles.full_name.
-- Решает кейс: autoAttachToBrand зашил UUID-стаб, потом triggerprofile
-- завершился — UI должен подхватить.
CREATE OR REPLACE FUNCTION sync_lawyer_client_name_from_profile()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.full_name IS NOT NULL AND length(trim(NEW.full_name)) > 0 THEN
    UPDATE lawyer_clients
    SET client_name = NEW.full_name, updated_at = now()
    WHERE client_user_id = NEW.id
      AND client_name LIKE 'Клиент #%';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_name_from_profile ON profiles;
CREATE TRIGGER trg_sync_client_name_from_profile
  AFTER INSERT OR UPDATE OF full_name ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_lawyer_client_name_from_profile();

-- Одноразовый бэкфилл существующих «Клиент #...» из profiles:
UPDATE lawyer_clients lc
SET client_name = p.full_name, updated_at = now()
FROM profiles p
WHERE lc.client_user_id = p.id
  AND lc.client_name LIKE 'Клиент #%'
  AND p.full_name IS NOT NULL
  AND length(trim(p.full_name)) > 0;
