-- ============================================================================
-- P1 (Этап 2): эскалация ИИ → живой юрист с переносом контекста.
--
-- Главный продуктовый пробел: из ИИ-сессии нельзя «передать дело юристу», и
-- контекст диалога не попадал в карточку. Добавляем:
--   • флаг lawyer_clients.escalation_requested (+ escalated_at) — юрист видит,
--     что клиент просит подключиться лично, и может приоритизировать;
--   • RPC client_escalate_to_lawyer — клиент помечает СВОЮ карточку и кладёт
--     сводку ИИ-сессии в ленту юриста (case_notes, note_type='escalation');
--   • RPC lawyer_clear_escalation — юрист снимает флаг, когда взял в работу.
--
-- case_notes писать может только юрист (RLS), поэтому RPC — SECURITY DEFINER
-- (вставка от имени клиента в обход RLS, но строго в свою карточку).
--
-- Снимаем легаси CHECK на case_notes.note_type (из v1 lawyer_cabinet) — в v2 его
-- не было; нужно, чтобы тип 'escalation' (и будущие) не отвергался.
-- ============================================================================

ALTER TABLE public.lawyer_clients
  ADD COLUMN IF NOT EXISTS escalation_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

ALTER TABLE public.case_notes
  DROP CONSTRAINT IF EXISTS case_notes_note_type_check;

-- ── Клиент: эскалировать СВОЮ карточку и передать сводку ИИ-сессии ──
CREATE OR REPLACE FUNCTION client_escalate_to_lawyer(
  p_lawyer_client_id UUID,
  p_summary TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;

  SELECT client_user_id INTO v_owner
  FROM lawyer_clients WHERE id = p_lawyer_client_id;

  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Карточка не найдена или не принадлежит вам';
  END IF;

  UPDATE lawyer_clients
  SET escalation_requested = true,
      escalated_at         = now(),
      priority             = 'urgent',
      updated_at           = now()
  WHERE id = p_lawyer_client_id;

  IF p_summary IS NOT NULL AND length(trim(p_summary)) > 0 THEN
    INSERT INTO case_notes (lawyer_client_id, author_id, content, note_type)
    VALUES (p_lawyer_client_id, v_uid, left(trim(p_summary), 4000), 'escalation');
  END IF;
END;
$$;

-- ── Юрист: снять флаг эскалации (взял в работу) ──
CREATE OR REPLACE FUNCTION lawyer_clear_escalation(
  p_lawyer_client_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Требуется авторизация'; END IF;

  UPDATE lawyer_clients
  SET escalation_requested = false,
      updated_at           = now()
  WHERE id = p_lawyer_client_id AND lawyer_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION client_escalate_to_lawyer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_escalate_to_lawyer(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION lawyer_clear_escalation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lawyer_clear_escalation(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
