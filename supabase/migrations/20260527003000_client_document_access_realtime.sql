-- Подключаем client_document_access к realtime publication, чтобы юрист в
-- открытой карточке клиента сразу получал событие, если клиент включил/
-- выключил доступ к документам и ИИ-анализу.
--
-- REPLICA IDENTITY FULL нужно, чтобы UPDATE-событие включало полный payload
-- (по умолчанию приходит только PK, без lawyer_id/is_active, и мы не сможем
-- понять, чьи именно права изменились).

ALTER TABLE public.client_document_access REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'client_document_access'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_document_access;
  END IF;
END $$;
