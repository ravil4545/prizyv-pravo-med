-- Маркетинговая телеметрия: UTM-разметка и ссылка на сущность события (тариф,
-- лид-магнит, статья). event_value — для агрегации денежных метрик
-- (подписка, валюта, проценты CTR).

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS event_ref TEXT,
  ADD COLUMN IF NOT EXISTS event_value NUMERIC;

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_ref
  ON public.analytics_events (event_ref) WHERE event_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_source
  ON public.analytics_events (utm_source) WHERE utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created
  ON public.analytics_events (event_type, created_at DESC);

COMMENT ON COLUMN public.analytics_events.utm_source IS 'Первый-touch utm_source из лендинга';
COMMENT ON COLUMN public.analytics_events.event_ref IS 'ID целевой сущности (план/магнит/статья) — для группировки';
COMMENT ON COLUMN public.analytics_events.event_value IS 'Числовая ценность события — деньги / score / процент';
