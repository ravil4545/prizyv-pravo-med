-- ============================================================================
-- P0-2: симметрия документов.
--
-- Раньше lawyer_client_med_docs (документы, которые ЮРИСТ загрузил по делу
-- клиента) читал только сам юрист. Привязанный клиент с аккаунтом не видел
-- эти сканы — поток документов был односторонним.
--
-- Даём клиенту право читать документы тех карточек lawyer_clients, где он
-- сам является client_user_id. Запись/изменение/удаление остаются за юристом.
-- Файлы лежат в bucket medical-documents (публичный) — отдельная storage-RLS
-- для клиента не требуется, ссылку он получает через signed URL.
-- ============================================================================

DROP POLICY IF EXISTS "Client reads docs of own linked card" ON public.lawyer_client_med_docs;
CREATE POLICY "Client reads docs of own linked card"
  ON public.lawyer_client_med_docs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lawyer_clients lc
      WHERE lc.id = lawyer_client_med_docs.lawyer_client_id
        AND lc.client_user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
