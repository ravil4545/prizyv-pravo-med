-- ============================================================================
-- Подключаем case_notes и case_events к Supabase Realtime.
-- Нужно для «единой ленты дела»: юрист в открытой карточке видит новые заметки
-- (смена этапа, ИИ-анализ) без F5, а клиентские события готовы к live-показу.
--
-- lawyer_clients / lawyer_chat_messages / medical_documents_v2 /
-- client_document_access уже в публикации (ранние миграции). Здесь добавляем
-- только две недостающие таблицы. Идемпотентно и аддитивно — RLS не трогаем.
-- ============================================================================

-- case_notes: лента заметок по делу (заметки юриста + системные смены этапа).
ALTER TABLE public.case_notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'case_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_notes;
  END IF;
END $$;

-- case_events: события призывного дела клиента (комиссия, суд, медкомиссия).
ALTER TABLE public.case_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'case_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_events;
  END IF;
END $$;
