-- ============================================================================
-- P1: устранение дублей карточек клиента и защита от их появления.
--
-- ПРОБЛЕМА: на lawyer_clients нет UNIQUE(lawyer_id, client_user_id). RPC-функции
-- защищаются от дублей только через SELECT…LIMIT 1 (не атомарно) → при гонке/
-- реанимации появлялись две карточки одного клиента у одного юриста.
--
-- РЕШЕНИЕ (НЕДЕСТРУКТИВНОЕ):
--   1) в каждой группе (lawyer_id, client_user_id) с client_user_id IS NOT NULL
--      выбираем «keeper» — самую живую карточку (linked_active > pending >
--      code_sent > прочее, затем свежайшую по updated_at/created_at);
--   2) ПЕРЕУКАЗЫВАЕМ дочерние строки дублей на keeper — история сохраняется:
--      чат (lawyer_chat_messages), лента (case_notes), документы юриста
--      (lawyer_client_med_docs), учёт шаблонов (lawyer_template_uses);
--   3) удаляем опустевшие карточки-дубли;
--   4) вешаем ЧАСТИЧНЫЙ UNIQUE-индекс (WHERE client_user_id IS NOT NULL) —
--      несвязанные/ручные карточки (client_user_id IS NULL) НЕ ограничиваются,
--      их у юриста может быть много.
--
-- ⚠️ ВНИМАНИЕ: миграция трогает существующие связи. ОБЯЗАТЕЛЬНО прогнать
--    сначала на копии/staging и убедиться, что число «схлопнутых» карточек
--    адекватно (см. контрольный SELECT в комментарии ниже).
--    Поля самой карточки-дубля (diagnosis/notes/crm_stage) НЕ сливаются —
--    остаются значения keeper. Сливаются только дочерние строки.
--
-- Контроль ДО применения (сколько групп-дублей и сколько лишних карточек):
--   SELECT count(*) AS dup_rows
--   FROM (
--     SELECT id, row_number() OVER (PARTITION BY lawyer_id, client_user_id
--            ORDER BY 1) rn
--     FROM lawyer_clients WHERE client_user_id IS NOT NULL
--   ) t WHERE rn > 1;
-- ============================================================================

DROP TABLE IF EXISTS _lc_dup_map;
CREATE TEMP TABLE _lc_dup_map AS
WITH ranked AS (
  SELECT
    id, lawyer_id, client_user_id,
    row_number() OVER (
      PARTITION BY lawyer_id, client_user_id
      ORDER BY
        CASE link_state
          WHEN 'linked_active'           THEN 0
          WHEN 'pending_client_approval' THEN 1
          WHEN 'code_sent'               THEN 2
          ELSE 3
        END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.lawyer_clients
  WHERE client_user_id IS NOT NULL
),
keepers AS (
  SELECT lawyer_id, client_user_id, id AS keep_id
  FROM ranked WHERE rn = 1
)
SELECT r.id AS dup_id, k.keep_id
FROM ranked r
JOIN keepers k
  ON k.lawyer_id      = r.lawyer_id
 AND k.client_user_id = r.client_user_id
WHERE r.rn > 1;

-- 2) Переуказываем дочерние строки дублей на keeper (история сохраняется)
UPDATE public.lawyer_chat_messages  m SET lawyer_client_id = d.keep_id
  FROM _lc_dup_map d WHERE m.lawyer_client_id = d.dup_id;

UPDATE public.case_notes            m SET lawyer_client_id = d.keep_id
  FROM _lc_dup_map d WHERE m.lawyer_client_id = d.dup_id;

UPDATE public.lawyer_template_uses  m SET lawyer_client_id = d.keep_id
  FROM _lc_dup_map d WHERE m.lawyer_client_id = d.dup_id;

UPDATE public.lawyer_client_med_docs m SET lawyer_client_id = d.keep_id
  FROM _lc_dup_map d WHERE m.lawyer_client_id = d.dup_id;

-- 3) Удаляем опустевшие карточки-дубли
DELETE FROM public.lawyer_clients
WHERE id IN (SELECT dup_id FROM _lc_dup_map);

DROP TABLE IF EXISTS _lc_dup_map;

-- 4) Частичный UNIQUE: один клиент-аккаунт = одна карточка у юриста.
--    NULL-карточки (ручные/неподтверждённые) не ограничиваются.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lawyer_clients_lawyer_client
  ON public.lawyer_clients (lawyer_id, client_user_id)
  WHERE client_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
