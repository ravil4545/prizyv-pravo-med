-- Дополнение к 20260526233000_lawyer_branding.sql.
--
-- В прод-БД на момент применения брендинг-миграции отсутствовали колонки
-- photo_url, specialization, license_number, bio, subscription_until,
-- хотя они декларировались в исходной миграции lawyer_cabinet_v2.sql.
-- Это вызывало PGRST204 при upsert из LawyerBrandingPage (фронт пишет
-- photo_url).
--
-- Безопасно добавляем недостающие колонки. ADD COLUMN IF NOT EXISTS
-- идемпотентно — в средах где они уже есть, ничего не сломает.

ALTER TABLE lawyer_profiles
  ADD COLUMN IF NOT EXISTS photo_url          TEXT,
  ADD COLUMN IF NOT EXISTS specialization     TEXT,
  ADD COLUMN IF NOT EXISTS license_number     TEXT,
  ADD COLUMN IF NOT EXISTS bio                TEXT,
  ADD COLUMN IF NOT EXISTS subscription_until TIMESTAMPTZ;

-- Сразу инвалидируем кэш схемы PostgREST, иначе клиент ~10 секунд
-- продолжит получать «column does not exist».
NOTIFY pgrst, 'reload schema';
