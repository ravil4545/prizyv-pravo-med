-- Invite-флоу для привязки клиента к карточке юриста БЕЗ передачи UUID.
-- Прежний поток («клиент скопируй свой UUID и пришли юристу») — главный
-- источник того, что ИИ-анализ юриста не запускается. Заменяем на короткий
-- человеко-вводимый код.
--
-- Поток:
--   1) Юрист добавляет клиента → автоматически генерируется invite_code (8 симв.).
--   2) Юрист делится ссылкой /lawyer-invite/<code> или просто кодом.
--   3) Клиент в своём кабинете жмёт «У меня код от юриста», вводит код,
--      RPC claim_lawyer_invite() автоматически:
--        - привязывает client_user_id;
--        - создаёт client_document_access (is_active = true);
--        - инвалидирует invite_code (чтобы повторно нельзя было привязаться).

-- ── 1. Колонка кода ────────────────────────────────────────────────────
ALTER TABLE lawyer_clients
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_lawyer_clients_invite_code
  ON lawyer_clients(invite_code)
  WHERE invite_code IS NOT NULL;

-- ── 2. Генератор кодов ─────────────────────────────────────────────────
-- 8 символов из безопасного алфавита (без 0/O/I/1, чтобы не путались).
CREATE OR REPLACE FUNCTION generate_lawyer_invite_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    -- Проверяем уникальность (вероятность коллизии низкая, но всё же).
    EXIT WHEN NOT EXISTS (SELECT 1 FROM lawyer_clients WHERE invite_code = code);
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Не удалось сгенерировать уникальный invite_code за 10 попыток';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- ── 3. Триггер: при INSERT — auto-fill invite_code если он не задан ───
CREATE OR REPLACE FUNCTION fill_lawyer_invite_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL AND NEW.client_user_id IS NULL THEN
    -- Если клиент уже привязан при создании — код не нужен.
    NEW.invite_code := generate_lawyer_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lawyer_clients_invite_code ON lawyer_clients;
CREATE TRIGGER trg_lawyer_clients_invite_code
  BEFORE INSERT ON lawyer_clients
  FOR EACH ROW EXECUTE FUNCTION fill_lawyer_invite_code();

-- Заполним коды для существующих не привязанных клиентов:
UPDATE lawyer_clients
SET invite_code = generate_lawyer_invite_code()
WHERE invite_code IS NULL AND client_user_id IS NULL;

-- ── 4. RPC для клиента: ввести код и привязаться ───────────────────────
-- SECURITY DEFINER нужен потому что клиент не имеет доступа к UPDATE
-- lawyer_clients (RLS режет всех кроме самого юриста). Тут мы аккуратно
-- проверяем код и выполняем UPDATE от имени БД.
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Введите код приглашения';
  END IF;

  -- Нормализуем: верхний регистр, без пробелов
  p_code := upper(replace(p_code, ' ', ''));

  SELECT * INTO v_row
  FROM lawyer_clients
  WHERE invite_code = p_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Код не найден или уже использован';
  END IF;

  IF v_row.client_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Это приглашение уже использовано';
  END IF;

  IF v_row.lawyer_id = v_uid THEN
    RAISE EXCEPTION 'Нельзя привязаться к собственной карточке клиента';
  END IF;

  -- Привязываем клиента и инвалидируем код
  UPDATE lawyer_clients
  SET client_user_id = v_uid,
      invite_code = NULL,
      updated_at = now()
  WHERE id = v_row.id;

  -- Открываем юристу доступ к медкартам клиента
  INSERT INTO client_document_access (client_user_id, lawyer_id, is_active)
  VALUES (v_uid, v_row.lawyer_id, true)
  ON CONFLICT (client_user_id, lawyer_id) DO UPDATE SET is_active = true;

  RETURN QUERY SELECT v_row.id, v_row.lawyer_id, v_row.client_name;
END;
$$;

REVOKE ALL ON FUNCTION claim_lawyer_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_lawyer_invite(TEXT) TO authenticated;

-- ── 5. RPC для регенерации кода (если юрист хочет «обновить» приглашение) ──
CREATE OR REPLACE FUNCTION regenerate_lawyer_invite(p_lawyer_client_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_new_code TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM lawyer_clients
    WHERE id = p_lawyer_client_id AND lawyer_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Нет доступа к этому клиенту';
  END IF;

  v_new_code := generate_lawyer_invite_code();

  UPDATE lawyer_clients
  SET invite_code = v_new_code,
      updated_at = now()
  WHERE id = p_lawyer_client_id AND client_user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Клиент уже привязан — код не нужен';
  END IF;

  RETURN v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION regenerate_lawyer_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION regenerate_lawyer_invite(UUID) TO authenticated;
