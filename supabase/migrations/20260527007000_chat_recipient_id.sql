-- ============================================================================
-- recipient_id в lawyer_chat_messages.
--
-- Старая модель: realtime-подписки идут на ВСЮ таблицу lawyer_chat_messages
-- без фильтра (5 разных мест в UI: useUnreadMessages, LawyerChatsPage,
-- LawyerClientsPage, LawyerClientDetail, ShareWithLawyer). Каждое INSERT в
-- системе триггерит refresh у всех активных юзеров.
--
-- Новая модель: для каждого сообщения заранее знаем «кому оно адресовано»
-- (получатель = противоположная сторона диалога). Фронт подписывается с
-- фильтром recipient_id = my_user_id и получает только свои события.
-- ============================================================================

ALTER TABLE lawyer_chat_messages
  ADD COLUMN IF NOT EXISTS recipient_id UUID;

CREATE INDEX IF NOT EXISTS idx_lawyer_chat_messages_recipient_unread
  ON lawyer_chat_messages(recipient_id)
  WHERE is_read = false;

-- Триггер BEFORE INSERT: вычисляем recipient_id из lawyer_clients.
-- sender_id уже задан (= автор), получатель = противоположная сторона
-- (lawyer_id если автор = client_user_id, иначе client_user_id).
CREATE OR REPLACE FUNCTION fill_chat_recipient_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lawyer_id UUID;
  v_client_user_id UUID;
BEGIN
  -- recipient_id может быть задан вручную (например для системных сообщений)
  IF NEW.recipient_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.lawyer_client_id IS NULL THEN RETURN NEW; END IF;

  SELECT lawyer_id, client_user_id INTO v_lawyer_id, v_client_user_id
  FROM lawyer_clients WHERE id = NEW.lawyer_client_id;

  IF v_lawyer_id IS NULL THEN RETURN NEW; END IF;

  -- Если client_user_id NULL (карточка анонимна) — recipient остаётся NULL,
  -- сообщение всё равно сохраняется, но realtime-фильтр получателя не
  -- подтянет. Это допустимо: до привязки клиент в чат не пишет.
  IF NEW.sender_id = v_lawyer_id THEN
    NEW.recipient_id := v_client_user_id;
  ELSIF NEW.sender_id = v_client_user_id THEN
    NEW.recipient_id := v_lawyer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lawyer_chat_messages_recipient ON lawyer_chat_messages;
CREATE TRIGGER trg_lawyer_chat_messages_recipient
  BEFORE INSERT ON lawyer_chat_messages
  FOR EACH ROW EXECUTE FUNCTION fill_chat_recipient_id();

-- Бэкфилл существующих сообщений
UPDATE lawyer_chat_messages m
SET recipient_id = CASE
  WHEN m.sender_id = lc.lawyer_id      THEN lc.client_user_id
  WHEN m.sender_id = lc.client_user_id THEN lc.lawyer_id
  ELSE NULL
END
FROM lawyer_clients lc
WHERE m.lawyer_client_id = lc.id
  AND m.recipient_id IS NULL;
