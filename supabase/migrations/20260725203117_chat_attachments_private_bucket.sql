-- ПРИМЕЧАНИЕ (25.07.2026). Файл лежал в репозитории с 28.05.2026 под
-- версией 20260528121000, но в прод НЕ попал: проверка показала, что бакет
-- всё ещё публичный, а политик у него нет ни одной. Из-за отсутствия
-- INSERT-политики отправка вложений в чат вообще не работала — бакет пуст.
-- Файл переименован под фактическую версию применения и дополнен
-- ограничениями на размер и тип файла.
-- ============================================================================
-- P0-3: приватный bucket для вложений чата.
--
-- Раньше вложения чата (в т.ч. медицинские сканы) отдавались публичной
-- ссылкой getPublicUrl — любой с URL мог их открыть. Делаем bucket приватным
-- и ограничиваем доступ участниками диалога. Фронт теперь хранит storage-путь
-- и показывает файл через signed URL.
--
-- Путь файла: chat/{lawyer_client_id}/{timestamp}.{ext}
--   foldername[1] = 'chat', foldername[2] = lawyer_client_id
-- Участник = клиент (lawyer_clients.client_user_id) или юрист (lawyer_id).
-- ============================================================================

-- Bucket: создать, если нет; в любом случае сделать приватным.
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Чтение — только участники диалога.
DROP POLICY IF EXISTS "Chat participants read attachments" ON storage.objects;
CREATE POLICY "Chat participants read attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.lawyer_clients lc
      WHERE lc.id::text = (storage.foldername(name))[2]
        AND (lc.client_user_id = auth.uid() OR lc.lawyer_id = auth.uid())
    )
  );

-- Загрузка — только участники диалога в папку своего диалога.
DROP POLICY IF EXISTS "Chat participants upload attachments" ON storage.objects;
CREATE POLICY "Chat participants upload attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.lawyer_clients lc
      WHERE lc.id::text = (storage.foldername(name))[2]
        AND (lc.client_user_id = auth.uid() OR lc.lawyer_id = auth.uid())
    )
  );

-- Удаление — только участники диалога (например, ошибочно загруженный файл).
DROP POLICY IF EXISTS "Chat participants delete attachments" ON storage.objects;
CREATE POLICY "Chat participants delete attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.lawyer_clients lc
      WHERE lc.id::text = (storage.foldername(name))[2]
        AND (lc.client_user_id = auth.uid() OR lc.lawyer_id = auth.uid())
    )
  );

-- Ограничения на файл: те же, что у медицинских документов. Без них в чат
-- можно залить что угодно и какого угодно размера.
UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'chat-attachments';
