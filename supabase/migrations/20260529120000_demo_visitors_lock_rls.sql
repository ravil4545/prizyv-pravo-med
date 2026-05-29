-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECURITY: закрываем публичный доступ к demo_visitors          ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Раньше таблица была открыта всем (RLS USING(true) на SELECT/UPDATE,
-- WITH CHECK(true) на INSERT) → любой с публичным anon-ключом мог:
--   • прочитать ВСЕ записи посетителей (user-agent, устройство, гео,
--     поведение, счётчики) — утечка PII анонимных посетителей сайта;
--   • изменить/испортить любую строку телеметрии.
--
-- Клиент эту таблицу только ПИШЕТ (upsert телеметрии) и НИКОГДА не читает.
-- Запись теперь идёт через edge-функцию track-demo на service-role
-- (service-role обходит RLS), поэтому прямой публичный доступ больше не нужен.
-- Оставляем только админскую политику (FOR ALL для роли admin),
-- созданную в 20260219090918 — она остаётся в силе.

DROP POLICY IF EXISTS "Anonymous users can insert their record" ON public.demo_visitors;
DROP POLICY IF EXISTS "Anonymous users can update their record" ON public.demo_visitors;
DROP POLICY IF EXISTS "Anonymous users can view their record"   ON public.demo_visitors;

-- RLS остаётся включённым. PERMISSIVE-политик для anon больше нет →
-- любой прямой доступ под anon/authenticated-ролью запрещён (fail-closed).
-- Доступ сохраняют: service-role (track-demo) и админы (has_role).
