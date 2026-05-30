-- ════════════════════════════════════════════════════════════════════════
--  P3 (ТЗ §2 — планировщик A3): таблицы плана дообследования и плана действий.
--
--  Якорь — карточка CRM (lawyer_clients): план принадлежит делу, ведёт его
--  юрист, привязанный клиент видит план (read-only). Конвенции RLS/триггера —
--  как у lawyer_client_med_docs (lawyer_id = auth.uid() + проверка владения
--  карточкой на INSERT; touch_updated_at).
--
--  source: 'ai' (сгенерировал планировщик A3) | 'lawyer' (правки юриста) —
--  чтобы перегенерация ИИ заменяла только ИИ-пункты, не трогая ручные.
-- ════════════════════════════════════════════════════════════════════════

-- ── План дообследования (анализы / обследования / специалисты) ─────────────
CREATE TABLE IF NOT EXISTS public.examination_plan_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_client_id uuid NOT NULL REFERENCES public.lawyer_clients(id) ON DELETE CASCADE,
  lawyer_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type        text NOT NULL CHECK (item_type IN ('analysis', 'examination', 'specialist')),
  name             text NOT NULL,
  reason           text,
  status           text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'cancelled')),
  due_date         date,
  source           text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'lawyer')),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_plan_client ON public.examination_plan_items (lawyer_client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exam_plan_lawyer ON public.examination_plan_items (lawyer_id);

-- ── Тактический план действий юриста (шаги/задачи дела) ────────────────────
CREATE TABLE IF NOT EXISTS public.action_plan_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lawyer_client_id uuid NOT NULL REFERENCES public.lawyer_clients(id) ON DELETE CASCADE,
  lawyer_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'cancelled')),
  priority         text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date         date,
  order_index      int NOT NULL DEFAULT 0,
  source           text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'lawyer')),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_plan_client ON public.action_plan_items (lawyer_client_id, order_index, created_at);
CREATE INDEX IF NOT EXISTS idx_action_plan_lawyer ON public.action_plan_items (lawyer_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.examination_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plan_items      ENABLE ROW LEVEL SECURITY;

-- Юрист — полный CRUD по делам, которыми владеет.
DROP POLICY IF EXISTS "Lawyer reads own exam plan" ON public.examination_plan_items;
CREATE POLICY "Lawyer reads own exam plan" ON public.examination_plan_items
  FOR SELECT USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer inserts own exam plan" ON public.examination_plan_items;
CREATE POLICY "Lawyer inserts own exam plan" ON public.examination_plan_items
  FOR INSERT WITH CHECK (
    lawyer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.lawyer_clients lc WHERE lc.id = lawyer_client_id AND lc.lawyer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Lawyer updates own exam plan" ON public.examination_plan_items;
CREATE POLICY "Lawyer updates own exam plan" ON public.examination_plan_items
  FOR UPDATE USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer deletes own exam plan" ON public.examination_plan_items;
CREATE POLICY "Lawyer deletes own exam plan" ON public.examination_plan_items
  FOR DELETE USING (lawyer_id = auth.uid());

-- Привязанный клиент — только чтение своего плана.
DROP POLICY IF EXISTS "Linked client reads exam plan" ON public.examination_plan_items;
CREATE POLICY "Linked client reads exam plan" ON public.examination_plan_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.lawyer_clients lc WHERE lc.id = lawyer_client_id AND lc.client_user_id = auth.uid())
  );

-- Аналогично для плана действий.
DROP POLICY IF EXISTS "Lawyer reads own action plan" ON public.action_plan_items;
CREATE POLICY "Lawyer reads own action plan" ON public.action_plan_items
  FOR SELECT USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer inserts own action plan" ON public.action_plan_items;
CREATE POLICY "Lawyer inserts own action plan" ON public.action_plan_items
  FOR INSERT WITH CHECK (
    lawyer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.lawyer_clients lc WHERE lc.id = lawyer_client_id AND lc.lawyer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Lawyer updates own action plan" ON public.action_plan_items;
CREATE POLICY "Lawyer updates own action plan" ON public.action_plan_items
  FOR UPDATE USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Lawyer deletes own action plan" ON public.action_plan_items;
CREATE POLICY "Lawyer deletes own action plan" ON public.action_plan_items
  FOR DELETE USING (lawyer_id = auth.uid());

DROP POLICY IF EXISTS "Linked client reads action plan" ON public.action_plan_items;
CREATE POLICY "Linked client reads action plan" ON public.action_plan_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.lawyer_clients lc WHERE lc.id = lawyer_client_id AND lc.client_user_id = auth.uid())
  );

-- ── Триггеры updated_at (touch_updated_at определён ранее; идемпотентно) ────
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exam_plan_updated_at ON public.examination_plan_items;
CREATE TRIGGER trg_exam_plan_updated_at
  BEFORE UPDATE ON public.examination_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_action_plan_updated_at ON public.action_plan_items;
CREATE TRIGGER trg_action_plan_updated_at
  BEFORE UPDATE ON public.action_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
