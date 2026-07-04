-- ═══════════════════════════════════════════════════════════════════════
-- КРИТИЧЕСКИЙ ФИКС: RLS на user_subscriptions разрешал пользователю
-- обновлять ЛЮБОЙ столбец своей строки — включая is_paid / paid_until /
-- admin_override / free_document_limit / free_ai_limit. Т.е. любой
-- авторизованный пользователь мог одним вызовом из консоли браузера:
--   supabase.from('user_subscriptions').update({is_paid:true, paid_until:'2099-01-01'})
-- выдать себе платный безлимитный доступ в обход оплаты (self-service paywall
-- bypass). Единственные легитимные клиентские записи в эту таблицу —
-- инкременты счётчиков document_uploads_used / ai_questions_used
-- (src/hooks/useSubscription.ts). Переносим их в security definer RPC
-- с атомарной проверкой квоты и убираем прямой UPDATE для authenticated
-- полностью. is_paid/paid_until/admin_override теперь меняются только через
-- существующую admin-политику ("Admins can update all subscriptions") или
-- service_role (notify-payment-click пишет payment_link_clicked_at через
-- service role — эту миграцию она не затрагивает).
-- ═══════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.user_subscriptions;

-- Инкремент счётчика AI-вопросов с атомарной проверкой квоты. Логика лимитов
-- зеркалит src/hooks/useSubscription.ts (canAskAI/TRIAL_AI_LIMIT=9) — при
-- изменении лимитов там нужно поправить и здесь.
CREATE OR REPLACE FUNCTION public.increment_ai_question_usage()
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sub public.user_subscriptions;
  limit_val integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO sub FROM public.user_subscriptions WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions (user_id) VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO sub FROM public.user_subscriptions WHERE user_id = auth.uid() FOR UPDATE;
  END IF;

  IF sub.admin_override IS TRUE OR (sub.is_paid IS TRUE AND sub.paid_until IS NOT NULL AND sub.paid_until > now()) THEN
    limit_val := NULL; -- безлимит
  ELSIF sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > now() THEN
    limit_val := 9; -- TRIAL_AI_LIMIT
  ELSE
    limit_val := sub.free_ai_limit;
  END IF;

  IF limit_val IS NOT NULL AND sub.ai_questions_used >= limit_val THEN
    RAISE EXCEPTION 'Лимит бесплатных вопросов ИИ исчерпан. Оформите подписку, чтобы продолжить.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_subscriptions
  SET ai_questions_used = ai_questions_used + 1
  WHERE user_id = auth.uid()
  RETURNING * INTO sub;

  RETURN sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_question_usage() TO authenticated;

-- Серверная квота на загрузку документов (слабое место: canUploadDocument()
-- жил только в React-состоянии на клиенте — обнулить localStorage или
-- вызвать insert напрямую было достаточно для обхода лимита). Проверка и
-- инкремент атомарны и происходят ПРИ insert в medical_documents_v2 —
-- единственной точке создания документа для этого пути (кабинет юриста
-- использует отдельную таблицу lawyer_client_med_docs и не затронут).
-- Лимиты зеркалят src/hooks/useSubscription.ts (canUploadDocument/TRIAL_DOC_LIMIT=9).
CREATE OR REPLACE FUNCTION public.enforce_document_upload_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sub public.user_subscriptions;
  limit_val integer;
BEGIN
  SELECT * INTO sub FROM public.user_subscriptions WHERE user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions (user_id) VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO sub FROM public.user_subscriptions WHERE user_id = NEW.user_id FOR UPDATE;
  END IF;

  IF sub.admin_override IS TRUE OR (sub.is_paid IS TRUE AND sub.paid_until IS NOT NULL AND sub.paid_until > now()) THEN
    limit_val := NULL; -- безлимит
  ELSIF sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > now() THEN
    limit_val := 9; -- TRIAL_DOC_LIMIT
  ELSE
    limit_val := sub.free_document_limit;
  END IF;

  IF limit_val IS NOT NULL AND sub.document_uploads_used >= limit_val THEN
    RAISE EXCEPTION 'Лимит бесплатных документов исчерпан. Оформите подписку, чтобы продолжить.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_subscriptions
  SET document_uploads_used = document_uploads_used + 1
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_document_upload_quota ON public.medical_documents_v2;
CREATE TRIGGER trg_enforce_document_upload_quota
BEFORE INSERT ON public.medical_documents_v2
FOR EACH ROW
EXECUTE FUNCTION public.enforce_document_upload_quota();
