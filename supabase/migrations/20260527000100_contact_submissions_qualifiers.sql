-- Квалификаторы лида: возраст призывника, стадия процесса, секция-источник.
-- Используются для приоритезации очереди обзвона и аналитики качества лидов.

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS age TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_stage
  ON public.contact_submissions (stage);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
  ON public.contact_submissions (created_at DESC);

COMMENT ON COLUMN public.contact_submissions.age IS 'Возраст призывника (один из значений из contactFormSchema)';
COMMENT ON COLUMN public.contact_submissions.stage IS 'Стадия призывного процесса — определяет срочность обращения';
COMMENT ON COLUMN public.contact_submissions.source IS 'Из какой секции лендинга пришёл лид (contact_form / exit_intent / lead_magnet)';
