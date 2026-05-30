-- ============================================================================
-- 152-ФЗ: фиксация согласия на обработку персональных данных.
--
-- Платформа обрабатывает спец-категорию ПДн (медицинские документы) и передаёт
-- их во внешний ИИ. По 152-ФЗ это требует явного согласия субъекта. Раньше
-- согласие нигде не фиксировалось. Добавляем:
--   • profiles.pdn_consent_at / pdn_consent_version — отметка о согласии;
--   • RPC record_pdn_consent — фиксирует согласие текущего пользователя
--     (SECURITY DEFINER — работает независимо от RLS на profiles).
--
-- ВНИМАНИЕ: точный ТЕКСТ согласия (UI + страница /privacy) — за владельцем/юристом;
-- здесь только механизм фиксации.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pdn_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdn_consent_version TEXT;

CREATE OR REPLACE FUNCTION public.record_pdn_consent(p_version TEXT DEFAULT 'v1')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;
  UPDATE public.profiles
  SET pdn_consent_at      = COALESCE(pdn_consent_at, now()),  -- не перезаписываем первую дату
      pdn_consent_version = p_version
  WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pdn_consent(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pdn_consent(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
