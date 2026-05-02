-- Fix: add lawyer_chat_messages to Supabase Realtime publication
-- and add edited_at column for message editing feature.

-- Ensure REPLICA IDENTITY FULL
ALTER TABLE lawyer_chat_messages REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lawyer_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lawyer_chat_messages;
  END IF;
END $$;

-- Column for tracking edits
ALTER TABLE lawyer_chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
