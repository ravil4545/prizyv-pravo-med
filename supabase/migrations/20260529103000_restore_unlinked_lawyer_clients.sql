-- Keep legacy lawyer-created CRM cards visible.
-- Some old rows were backfilled to link_state='unlinked' because they had no
-- client_user_id and no invite_code. They are real CRM cards and should behave
-- like invite-ready cards, not like archived records.

CREATE OR REPLACE FUNCTION public.generate_lawyer_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.lawyer_clients WHERE invite_code = code
    );
  END LOOP;

  RETURN code;
END;
$$;

UPDATE public.lawyer_clients
SET
  invite_code = COALESCE(invite_code, public.generate_lawyer_invite_code()),
  link_state = 'code_sent',
  requested_at = COALESCE(requested_at, created_at, now()),
  updated_at = now()
WHERE client_user_id IS NULL
  AND link_state = 'unlinked'
  AND invite_code IS NULL;
