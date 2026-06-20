-- ============================================================================
-- RPC client_cancel_escalation — клиент отменяет свой запрос «передать дело
-- юристу» (эскалацию из ИИ-чата), пока юрист не взял его в работу.
--
-- Клиент не может напрямую UPDATE-ить lawyer_clients (RLS даёт только SELECT
-- своей строки), поэтому нужна SECURITY DEFINER функция с проверкой владельца.
-- Парная к client_escalate_to_lawyer / lawyer_clear_escalation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_cancel_escalation(
  p_lawyer_client_id UUID
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация';
  END IF;

  SELECT client_user_id INTO v_owner
  FROM public.lawyer_clients
  WHERE id = p_lawyer_client_id;

  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Карточка не найдена или не принадлежит вам';
  END IF;

  UPDATE public.lawyer_clients
  SET escalation_requested = false,
      escalated_at = NULL,
      updated_at = now()
  WHERE id = p_lawyer_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_cancel_escalation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_cancel_escalation(UUID) TO authenticated;
