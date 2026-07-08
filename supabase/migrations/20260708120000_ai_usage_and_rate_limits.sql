-- ═══════════════════════════════════════════════════════════════════════
-- Анти-абьюз расхода ИИ: подписка стоит 4990₽ — расход токенов ИИ на
-- подписчика не должен превышать ~1650₽/мес. Раньше расход не считался
-- вообще (llm_usage_daily — только request_count по модели, без токенов и
-- привязки к пользователю, не пишется с июня), а демо/бесплатные лимиты
-- были только клиентскими (localStorage), без сервера.
--
-- Здесь: леджер расхода по каждому вызову LLM (user_id ИЛИ ip_hash для
-- анонимных вызовов chat/chat-rag) + rate-limit по IP для анонимных вызовов.
-- Сама логика бюджета/деградации модели — в supabase/functions/_shared/aiUsage.ts,
-- вызывается из chat/index.ts и chat-rag/index.ts.
-- ═══════════════════════════════════════════════════════════════════════

-- IF NOT EXISTS / DROP…IF EXISTS повсюду: миграцию через MCP apply_migration уже
-- применили под другой version-меткой, чем имя файла (рассинхрон истории миграций
-- в репо и schema_migrations — норма для этого проекта, см. AGENTS.md). Идемпотентность
-- страхует от повторного применения при возможном `supabase db push`.
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_rub NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx ON public.ai_usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_ip_created_idx ON public.ai_usage_events (ip_hash, created_at) WHERE ip_hash IS NOT NULL;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Пишут только edge-функции через service_role (обходит RLS). Читает — только админка.
DROP POLICY IF EXISTS "Admins can view ai usage" ON public.ai_usage_events;
CREATE POLICY "Admins can view ai usage" ON public.ai_usage_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Rate-limit анонимных вызовов по IP: одна строка на (ключ, окно суток).
-- Ключ = "<функция>:<ip_hash>" — так chat и chat-rag лимитируются независимо
-- без отдельной колонки под каждую функцию.
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_hits (
  rl_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (rl_key, window_start)
);

ALTER TABLE public.ai_rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Политик нет: таблицу трогает только service_role (edge-функции), обходит RLS.

-- Атомарный upsert+increment+проверка лимита — тот же паттерн, что и
-- increment_ai_question_usage (миграция subscription_rls_and_quota_hardening).
CREATE OR REPLACE FUNCTION public.bump_ai_rate_limit(p_key TEXT, p_window_start TIMESTAMPTZ, p_max_requests INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO public.ai_rate_limit_hits (rl_key, window_start, request_count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (rl_key, window_start)
  DO UPDATE SET request_count = ai_rate_limit_hits.request_count + 1
  RETURNING request_count INTO new_count;

  RETURN new_count <= p_max_requests;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_ai_rate_limit(TEXT, TIMESTAMPTZ, INTEGER) TO service_role;
