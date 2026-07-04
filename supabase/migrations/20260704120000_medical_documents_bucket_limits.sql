-- Серверные ограничения на bucket medical-documents (слабое место: клиент мог
-- загрузить файл любого типа/размера — contentType и есть ли контроль размера
-- решал только браузер). Постранично документы уже сжаты до JPEG ≤2000px на
-- клиенте перед сборкой PDF (см. src/lib/documentMerger.ts), поэтому 20MB —
-- щедрый потолок даже для многостраничных выписок с фото высокого разрешения.
UPDATE storage.buckets
SET
  file_size_limit = 20 * 1024 * 1024,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
WHERE id = 'medical-documents';
