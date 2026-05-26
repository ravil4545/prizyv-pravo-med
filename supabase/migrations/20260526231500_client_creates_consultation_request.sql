-- Клиент должен иметь возможность сам инициировать запрос консультации
-- через /lawyers → "Нужна консультация". Сейчас единственная INSERT-policy на
-- lawyer_clients — "Lawyer manages own clients" с auth.uid() = lawyer_id,
-- что блокирует попытку клиента создать запись.
--
-- Добавляем точечную INSERT-policy: клиент может создать запись с собой
-- в качестве client_user_id, но только для активного юриста. Это запрос
-- консультации; дальше юрист (или админ) управляет CRM-этапами.
--
-- Также разрешаем клиенту обновлять только своё поле notes (не реализовано
-- сейчас, но оставляем место). UPDATE для смены lawyer_id или crm_stage
-- клиентом запрещён.

DROP POLICY IF EXISTS "Client requests consultation" ON lawyer_clients;
CREATE POLICY "Client requests consultation" ON lawyer_clients
  FOR INSERT
  WITH CHECK (
    auth.uid() = client_user_id
    AND EXISTS (
      SELECT 1 FROM lawyer_profiles lp
      WHERE lp.user_id = lawyer_clients.lawyer_id
        AND lp.is_active = true
    )
  );
