-- Документы, которые юрист загружает САМ для CRM-клиента без аккаунта
-- (когда клиент не работает через сайт). Отдельная таблица — чтобы не
-- путаться с user_id из medical_documents_v2 (там аккаунт обязателен).

CREATE TABLE IF NOT EXISTS public.lawyer_client_med_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_client_id uuid NOT NULL REFERENCES public.lawyer_clients(id) ON DELETE CASCADE,
  lawyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  document_date date,
  file_url text NOT NULL,
  raw_text text,
  ai_fitness_category text,
  ai_category_chance int,
  ai_explanation text,
  ai_recommendations jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcmd_lawyer_client ON public.lawyer_client_med_docs (lawyer_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcmd_lawyer ON public.lawyer_client_med_docs (lawyer_id);

ALTER TABLE public.lawyer_client_med_docs ENABLE ROW LEVEL SECURITY;

-- Юрист видит только документы своих клиентов
DROP POLICY IF EXISTS "Lawyer reads own client docs" ON public.lawyer_client_med_docs;
CREATE POLICY "Lawyer reads own client docs"
  ON public.lawyer_client_med_docs
  FOR SELECT
  USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer inserts own client docs" ON public.lawyer_client_med_docs;
CREATE POLICY "Lawyer inserts own client docs"
  ON public.lawyer_client_med_docs
  FOR INSERT
  WITH CHECK (
    lawyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.lawyer_clients lc
      WHERE lc.id = lawyer_client_id AND lc.lawyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Lawyer updates own client docs" ON public.lawyer_client_med_docs;
CREATE POLICY "Lawyer updates own client docs"
  ON public.lawyer_client_med_docs
  FOR UPDATE
  USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer deletes own client docs" ON public.lawyer_client_med_docs;
CREATE POLICY "Lawyer deletes own client docs"
  ON public.lawyer_client_med_docs
  FOR DELETE
  USING (lawyer_id = auth.uid());

-- Триггер updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lcmd_updated_at ON public.lawyer_client_med_docs;
CREATE TRIGGER trg_lcmd_updated_at
  BEFORE UPDATE ON public.lawyer_client_med_docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Папка в существующем bucket medical-documents:
--   lawyer-uploads/{lawyer_id}/{lawyer_client_id}/{timestamp}_{name}
-- Bucket уже приватный, RLS storage пишет authenticated пользователь.
-- Для чтения signed url используется существующий getSignedDocumentUrl.

NOTIFY pgrst, 'reload schema';
