-- ════════════════════════════════════════════════════════════════════════
--  P0.1 (ТЗ §0.1): суточный счётчик запросов к LLM (RPD).
--
--  Groq НЕ отдаёт остаток RPD в заголовках, а free-tier ограничен (~1000/сут,
--  сброс в полночь UTC). Без собственного счётчика упрёмся в потолок в проде
--  незаметно. Ведём счётчик по (дата_UTC, модель); инкремент — атомарным RPC
--  из LLMGateway (service-role, обходит RLS). Чтение — только админ.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.llm_usage_daily (
  usage_date    date        NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  model         text        NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_date, model)
);

ALTER TABLE public.llm_usage_daily ENABLE ROW LEVEL SECURITY;

-- Прямой доступ — только админам (запись идёт через service-role RPC).
DROP POLICY IF EXISTS "Admin reads llm usage" ON public.llm_usage_daily;
CREATE POLICY "Admin reads llm usage" ON public.llm_usage_daily
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Атомарный инкремент за текущие UTC-сутки, возвращает новое значение счётчика.
CREATE OR REPLACE FUNCTION public.llm_increment_rpd(p_model text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  INSERT INTO public.llm_usage_daily (usage_date, model, request_count, updated_at)
  VALUES (v_today, coalesce(p_model, 'unknown'), 1, now())
  ON CONFLICT (usage_date, model)
  DO UPDATE SET request_count = llm_usage_daily.request_count + 1, updated_at = now()
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.llm_increment_rpd(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.llm_increment_rpd(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
