
-- 1. Fix demo_visitors RLS policies
DROP POLICY IF EXISTS "Anonymous users can view their record" ON public.demo_visitors;
DROP POLICY IF EXISTS "Anonymous users can view their own record" ON public.demo_visitors;
DROP POLICY IF EXISTS "Anonymous users can insert their record" ON public.demo_visitors;
DROP POLICY IF EXISTS "Anonymous users can update their record" ON public.demo_visitors;

CREATE POLICY "Anonymous users can view their own record"
ON public.demo_visitors FOR SELECT
USING (
  session_id = (current_setting('request.headers', true)::json->>'x-session-id')::uuid
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Anonymous users can insert their record"
ON public.demo_visitors FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anonymous users can update their own record"
ON public.demo_visitors FOR UPDATE
USING (
  session_id = (current_setting('request.headers', true)::json->>'x-session-id')::uuid
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Recreate analytics_summary view as SECURITY INVOKER
DROP VIEW IF EXISTS public.analytics_summary;
CREATE VIEW public.analytics_summary
WITH (security_invoker = true) AS
SELECT date(created_at) AS date,
    count(*) AS total_events,
    count(DISTINCT session_id) AS unique_sessions,
    count(DISTINCT user_id) AS unique_users,
    count(*) FILTER (WHERE event_type = 'page_view'::text) AS page_views,
    avg(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS avg_duration
FROM analytics_events
GROUP BY (date(created_at))
ORDER BY (date(created_at)) DESC;

-- 3. Fix mutable search_path on functions
ALTER FUNCTION public.match_rag_chunks(query_embedding vector, match_count integer, min_similarity double precision) SET search_path = public;
ALTER FUNCTION public.update_user_diagnoses_updated_at() SET search_path = public;
ALTER FUNCTION public.update_lawyer_client_timestamp() SET search_path = public;
