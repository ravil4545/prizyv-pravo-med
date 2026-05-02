-- Fix: ensure lawyer cabinet tables exist and crm_stage is TEXT (not ENUM)
-- Safe to run multiple times (idempotent).

-- ── Drop ENUM type if it exists (only safe when no columns use it yet) ────────
-- Convert existing crm_stage column to TEXT first if the table already exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lawyer_clients' AND column_name = 'crm_stage'
      AND udt_name = 'crm_stage'
  ) THEN
    ALTER TABLE lawyer_clients ALTER COLUMN crm_stage TYPE TEXT;
  END IF;
END $$;

DROP TYPE IF EXISTS crm_stage CASCADE;

-- ── Create tables (IF NOT EXISTS — safe if already created) ──────────────────

CREATE TABLE IF NOT EXISTS lawyer_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name         TEXT,
  specialization    TEXT,
  license_number    TEXT,
  bio               TEXT,
  photo_url         TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  subscription_tier TEXT        NOT NULL DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro')),
  subscription_until TIMESTAMPTZ,
  clients_limit     INTEGER     NOT NULL DEFAULT 5,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lawyer_clients (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name       TEXT        NOT NULL,
  client_phone      TEXT,
  client_email      TEXT,
  client_birth_year INTEGER,
  crm_stage         TEXT        NOT NULL DEFAULT 'initial_contact',
  diagnosis         TEXT,
  expected_category TEXT,
  notes             TEXT,
  priority          TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  conscription_date DATE,
  case_won          BOOLEAN     DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_document_access (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lawyer_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_user_id, lawyer_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_client_id  UUID        NOT NULL REFERENCES lawyer_clients(id) ON DELETE CASCADE,
  sender_id         UUID        NOT NULL REFERENCES auth.users(id),
  content           TEXT,
  message_type      TEXT        NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image')),
  file_url          TEXT,
  file_name         TEXT,
  file_size         INTEGER,
  is_read           BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_notes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_client_id  UUID        NOT NULL REFERENCES lawyer_clients(id) ON DELETE CASCADE,
  author_id         UUID        NOT NULL REFERENCES auth.users(id),
  content           TEXT        NOT NULL,
  note_type         TEXT        NOT NULL DEFAULT 'note' CHECK (note_type IN ('note', 'stage_change', 'document', 'reminder')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lawyer_template_uses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_id        UUID        NOT NULL REFERENCES auth.users(id),
  template_key     TEXT        NOT NULL,
  lawyer_client_id UUID        REFERENCES lawyer_clients(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lawyer_clients_lawyer_id  ON lawyer_clients(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_clients_client_uid ON lawyer_clients(client_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_client      ON chat_messages(lawyer_client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_case_notes_client         ON case_notes(lawyer_client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_doc_access_lawyer         ON client_document_access(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_client         ON client_document_access(client_user_id);

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE lawyer_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawyer_clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_document_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawyer_template_uses   ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "Lawyer own profile"             ON lawyer_profiles;
DROP POLICY IF EXISTS "Lawyer manages own clients"     ON lawyer_clients;
DROP POLICY IF EXISTS "Client views own lawyer entry"  ON lawyer_clients;
DROP POLICY IF EXISTS "Client manages doc access"      ON client_document_access;
DROP POLICY IF EXISTS "Lawyer reads doc access"        ON client_document_access;
DROP POLICY IF EXISTS "Chat participants read"         ON chat_messages;
DROP POLICY IF EXISTS "Chat participants insert"       ON chat_messages;
DROP POLICY IF EXISTS "Chat participants update is_read" ON chat_messages;
DROP POLICY IF EXISTS "Lawyer manages case notes"      ON case_notes;
DROP POLICY IF EXISTS "Lawyer manages template uses"   ON lawyer_template_uses;
DROP POLICY IF EXISTS "Lawyer reads shared medical docs" ON medical_documents_v2;

CREATE POLICY "Lawyer own profile" ON lawyer_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Lawyer manages own clients" ON lawyer_clients
  FOR ALL USING (auth.uid() = lawyer_id)
  WITH CHECK (auth.uid() = lawyer_id);

CREATE POLICY "Client views own lawyer entry" ON lawyer_clients
  FOR SELECT USING (auth.uid() = client_user_id);

CREATE POLICY "Client manages doc access" ON client_document_access
  FOR ALL USING (auth.uid() = client_user_id);

CREATE POLICY "Lawyer reads doc access" ON client_document_access
  FOR SELECT USING (auth.uid() = lawyer_id);

CREATE POLICY "Chat participants read" ON chat_messages
  FOR SELECT USING (
    auth.uid() = sender_id
    OR auth.uid() IN (
      SELECT lawyer_id      FROM lawyer_clients WHERE id = lawyer_client_id
      UNION ALL
      SELECT client_user_id FROM lawyer_clients WHERE id = lawyer_client_id AND client_user_id IS NOT NULL
    )
  );

CREATE POLICY "Chat participants insert" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IN (
      SELECT lawyer_id      FROM lawyer_clients WHERE id = lawyer_client_id
      UNION ALL
      SELECT client_user_id FROM lawyer_clients WHERE id = lawyer_client_id AND client_user_id IS NOT NULL
    )
  );

CREATE POLICY "Chat participants update is_read" ON chat_messages
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT lawyer_id      FROM lawyer_clients WHERE id = lawyer_client_id
      UNION ALL
      SELECT client_user_id FROM lawyer_clients WHERE id = lawyer_client_id AND client_user_id IS NOT NULL
    )
  );

CREATE POLICY "Lawyer manages case notes" ON case_notes
  FOR ALL USING (
    auth.uid() IN (SELECT lawyer_id FROM lawyer_clients WHERE id = lawyer_client_id)
  );

CREATE POLICY "Lawyer manages template uses" ON lawyer_template_uses
  FOR ALL USING (auth.uid() = lawyer_id);

CREATE POLICY "Lawyer reads shared medical docs" ON medical_documents_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_document_access cda
      WHERE cda.client_user_id = medical_documents_v2.user_id
        AND cda.lawyer_id      = auth.uid()
        AND cda.is_active      = true
    )
  );

-- ── Trigger: auto-update updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_lawyer_client_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lawyer_clients_updated_at ON lawyer_clients;
CREATE TRIGGER trg_lawyer_clients_updated_at
  BEFORE UPDATE ON lawyer_clients
  FOR EACH ROW EXECUTE FUNCTION update_lawyer_client_timestamp();
