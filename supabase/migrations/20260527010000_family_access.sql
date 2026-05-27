-- Семейный доступ (read-only) — родственники призывника могут видеть
-- его дело: документы, AI-анализ, события дела. По явному приглашению.
--
-- Схема:
--   owner_user_id  — призывник (тот, чьи данные)
--   invitee_email  — email приглашённого (может быть ещё не зарегистрирован)
--   viewer_user_id — после принятия приглашения связывается с auth.users
--   status         — invited | accepted | revoked
--   scopes         — jsonb со списком разрешённых разделов:
--                    documents, ai_analysis, case_events, chat_with_lawyer
--   relationship   — родитель / супруг / иное (текст)
--
-- Приглашение приходит по email, viewer переходит по ссылке /family/accept/:token
-- и получает read-only доступ к данным owner.

-- citext чтобы email-проверка не зависела от регистра
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS public.family_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email citext NOT NULL,
  invite_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked', 'expired')),
  scopes jsonb NOT NULL DEFAULT '{"documents":true,"ai_analysis":true,"case_events":true,"chat_with_lawyer":false}'::jsonb,
  relationship text,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (owner_user_id, invitee_email)
);

CREATE INDEX IF NOT EXISTS idx_family_access_owner ON public.family_access (owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_family_access_viewer ON public.family_access (viewer_user_id) WHERE viewer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_family_access_token ON public.family_access (invite_token) WHERE status = 'invited';

ALTER TABLE public.family_access ENABLE ROW LEVEL SECURITY;

-- Призывник видит/создаёт/удаляет свои приглашения
DROP POLICY IF EXISTS "Owner manages own invites" ON public.family_access;
CREATE POLICY "Owner manages own invites"
  ON public.family_access
  FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Viewer видит приглашения, где он viewer (после принятия)
DROP POLICY IF EXISTS "Viewer reads accepted invites" ON public.family_access;
CREATE POLICY "Viewer reads accepted invites"
  ON public.family_access
  FOR SELECT
  USING (viewer_user_id = auth.uid() AND status = 'accepted');

-- ── Расширяем RLS для существующих таблиц, чтобы viewer мог читать ────

-- medical_documents_v2: viewer с активным family_access + scopes.documents видит документы owner
DROP POLICY IF EXISTS "Family viewer reads med docs" ON public.medical_documents_v2;
CREATE POLICY "Family viewer reads med docs"
  ON public.medical_documents_v2
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.family_access fa
      WHERE fa.owner_user_id = medical_documents_v2.user_id
        AND fa.viewer_user_id = auth.uid()
        AND fa.status = 'accepted'
        AND fa.expires_at > now()
        AND (fa.scopes->>'documents')::boolean = true
    )
  );

-- document_article_links: то же самое, через JOIN на medical_documents_v2
DROP POLICY IF EXISTS "Family viewer reads doc links" ON public.document_article_links;
CREATE POLICY "Family viewer reads doc links"
  ON public.document_article_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_documents_v2 m
      INNER JOIN public.family_access fa ON fa.owner_user_id = m.user_id
      WHERE m.id = document_article_links.document_id
        AND fa.viewer_user_id = auth.uid()
        AND fa.status = 'accepted'
        AND fa.expires_at > now()
        AND (fa.scopes->>'ai_analysis')::boolean = true
    )
  );

-- case_events: viewer со scopes.case_events видит события owner
DROP POLICY IF EXISTS "Family viewer reads case events" ON public.case_events;
CREATE POLICY "Family viewer reads case events"
  ON public.case_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.family_access fa
      WHERE fa.owner_user_id = case_events.user_id
        AND fa.viewer_user_id = auth.uid()
        AND fa.status = 'accepted'
        AND fa.expires_at > now()
        AND (fa.scopes->>'case_events')::boolean = true
    )
  );

-- profiles: viewer может читать профиль owner (без чувствительных полей в SELECT)
DROP POLICY IF EXISTS "Family viewer reads owner profile" ON public.profiles;
CREATE POLICY "Family viewer reads owner profile"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.family_access fa
      WHERE fa.owner_user_id = profiles.id
        AND fa.viewer_user_id = auth.uid()
        AND fa.status = 'accepted'
        AND fa.expires_at > now()
    )
  );

-- ── Хелпер-функция для принятия приглашения ────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_family_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.family_access%ROWTYPE;
  v_user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_invite
  FROM public.family_access
  WHERE invite_token = p_token
    AND status = 'invited'
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invite_not_found_or_expired');
  END IF;

  IF lower(v_invite.invitee_email) <> lower(v_user_email) THEN
    RETURN jsonb_build_object('error', 'email_mismatch');
  END IF;

  IF v_invite.owner_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'cannot_invite_self');
  END IF;

  UPDATE public.family_access
  SET viewer_user_id = auth.uid(),
      status = 'accepted',
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'owner_user_id', v_invite.owner_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_family_invite(text) TO authenticated;

COMMENT ON TABLE public.family_access IS
  'Read-only семейный доступ к делу призывника. Owner приглашает viewer-а по email — приглашение действует 30 дней.';
