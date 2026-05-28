-- ============================================================================
-- Тумблер доступа клиента теперь покрывает и ПРОФИЛЬ, а не только меддоки.
--
-- Раньше client_document_access открывал юристу только medical_documents_v2
-- (+ их ИИ-расшифровки, т.к. это поля той же таблицы). Профиль клиента
-- (ФИО, адрес, телефон в profiles) юрист не видел даже при открытом доступе.
--
-- Добавляем RLS-политику: юрист читает profiles клиента, если у него активен
-- client_document_access. Это нужно, чтобы при включённом тумблере юрист
-- видел реальные данные клиента (для шаблонов, досье и т.д.), а при
-- выключенном — нет.
-- ============================================================================

DROP POLICY IF EXISTS "Lawyer reads granted client profile" ON profiles;
CREATE POLICY "Lawyer reads granted client profile" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_document_access cda
      WHERE cda.client_user_id = profiles.id
        AND cda.lawyer_id = auth.uid()
        AND cda.is_active = true
    )
  );
