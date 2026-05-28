-- ============================================================================
-- ХОТФИКС: «permission denied for table users» в RLS-политике lawyer_clients.
--
-- В миграции 20260527005000_link_state_and_requests.sql политика
-- «Client views own lawyer entry» делала прямой SELECT email FROM auth.users
-- в RLS-условии. RLS выполняется от имени запрашивающего юзера (authenticated),
-- а у этой роли нет SELECT на auth.users → любой SELECT из lawyer_clients
-- падал с «permission denied for table users» (в том числе админский список
-- пользователей в /admin/users).
--
-- Фикс: вводим SECURITY DEFINER helper current_user_email() — он умеет читать
-- auth.users, но возвращает только email самого себя. RLS использует его
-- вместо прямого подзапроса.
-- ============================================================================

-- 1. Helper, который безопасно возвращает email текущего юзера.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;

-- 2. Перевешиваем RLS-политику на helper вместо прямого SELECT auth.users.
DROP POLICY IF EXISTS "Client views own lawyer entry" ON lawyer_clients;
CREATE POLICY "Client views own lawyer entry" ON lawyer_clients
  FOR SELECT USING (
    auth.uid() = client_user_id
    OR (
      link_state = 'pending_client_approval'
      AND target_email IS NOT NULL
      AND target_email = public.current_user_email()
    )
  );
