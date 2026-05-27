-- Bucket для брендинговых ассетов юристов: фото, логотипы.
-- Публичный (т.к. лендинг /u/<slug> доступен всем), но writes — только
-- от владельца файла (юрист пишет в свою папку).
--
-- Файлы хранятся как: <user_id>/<filename>
-- Это позволяет элементарной RLS-проверкой ограничить запись только владельцу.

INSERT INTO storage.buckets (id, name, public)
VALUES ('lawyer-brand-assets', 'lawyer-brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Чтение разрешено всем (бренд-страница публичная)
DROP POLICY IF EXISTS "Lawyer brand assets are public" ON storage.objects;
CREATE POLICY "Lawyer brand assets are public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'lawyer-brand-assets');

-- Запись/обновление/удаление — только в свою папку (первый сегмент пути = auth.uid())
DROP POLICY IF EXISTS "Lawyer uploads own brand assets" ON storage.objects;
CREATE POLICY "Lawyer uploads own brand assets" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'lawyer-brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Lawyer updates own brand assets" ON storage.objects;
CREATE POLICY "Lawyer updates own brand assets" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'lawyer-brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Lawyer deletes own brand assets" ON storage.objects;
CREATE POLICY "Lawyer deletes own brand assets" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'lawyer-brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
