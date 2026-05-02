-- Enable Realtime on medical_documents_v2 so the lawyer cabinet receives
-- live updates when a client uploads a new document.

ALTER TABLE medical_documents_v2 REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'medical_documents_v2'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE medical_documents_v2;
  END IF;
END $$;
