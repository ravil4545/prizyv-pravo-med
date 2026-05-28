-- ============================================================================
-- P1-4: серверная защита от обмена контактами в чате до договора.
--
-- Раньше вычистка телефонов/email/мессенджеров жила только во фронте
-- (sanitizeChatMessage). Запрос напрямую в БД (или модифицированный клиент)
-- мог записать контакты в обход. Дублируем логику в BEFORE-триггере —
-- теперь это инвариант на уровне БД, а фронт остаётся для мгновенной обратной
-- связи пользователю.
--
-- Зеркалит src/lib/chatSanitizer.ts. Порядок важен: UUID раньше телефонов,
-- чтобы цифры идентификатора не съел phone-паттерн.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sanitize_chat_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v    text;
  repl constant text := '[контакт скрыт администрацией]';
BEGIN
  IF NEW.content IS NULL OR NEW.message_type <> 'text' THEN
    RETURN NEW;
  END IF;

  v := NEW.content;

  -- UUID (например, user_id) — раньше телефонов
  v := regexp_replace(v, '\y[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\y', repl, 'gi');
  -- Телефоны: 9–15 цифр с разделителями
  v := regexp_replace(v, '(\+?[0-9][[:space:]().-]?){9,15}[0-9]', repl, 'g');
  -- Email
  v := regexp_replace(v, '[[:alnum:]_.+-]+@[[:alnum:]_-]+\.[[:alnum:]_.-]+', repl, 'gi');
  -- @username (Telegram), сохраняем ведущий пробел/начало строки
  v := regexp_replace(v, '(^|[[:space:]])@[a-zA-Z0-9_]{5,32}', '\1' || repl, 'g');
  -- Ссылки на мессенджеры
  v := regexp_replace(v, '(t\.me|telegram\.me|wa\.me|whatsapp\.com|viber\.com|signal\.org|join\.skype\.com)/[^[:space:])>"'']*', repl, 'gi');

  NEW.content := v;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_chat_insert ON public.lawyer_chat_messages;
CREATE TRIGGER trg_sanitize_chat_insert
  BEFORE INSERT ON public.lawyer_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_chat_message();

-- На UPDATE — только когда реально меняется текст (не на каждый is_read).
DROP TRIGGER IF EXISTS trg_sanitize_chat_update ON public.lawyer_chat_messages;
CREATE TRIGGER trg_sanitize_chat_update
  BEFORE UPDATE ON public.lawyer_chat_messages
  FOR EACH ROW
  WHEN (NEW.content IS DISTINCT FROM OLD.content)
  EXECUTE FUNCTION public.sanitize_chat_message();
