-- White-label брендинг для каждого юриста.
--
-- Юрист получает свою копию сайта по адресу nepriziv.ru/u/<slug> которая
-- выглядит как его личное приложение: его ФИО, фото, контакты, контентные
-- акценты. Клиент, перешедший по такой ссылке, не должен знать про nepriziv.ru
-- и других юристов — это «лавка» конкретного юриста.
--
-- Поля бренда добавляем в lawyer_profiles. full_name и photo_url уже есть.

ALTER TABLE lawyer_profiles
  ADD COLUMN IF NOT EXISTS slug             TEXT,
  ADD COLUMN IF NOT EXISTS brand_subtitle   TEXT,
  ADD COLUMN IF NOT EXISTS brand_about      TEXT,
  ADD COLUMN IF NOT EXISTS brand_phone      TEXT,
  ADD COLUMN IF NOT EXISTS brand_telegram   TEXT,
  ADD COLUMN IF NOT EXISTS brand_whatsapp   TEXT,
  ADD COLUMN IF NOT EXISTS brand_email      TEXT,
  ADD COLUMN IF NOT EXISTS accent_color     TEXT;

-- Slug — уникальная составляющая публичного URL /u/<slug>. Допускаем NULL
-- (юрист может работать в платформе без своего «магазина»), но если задан —
-- он должен быть уникальным.
CREATE UNIQUE INDEX IF NOT EXISTS lawyer_profiles_slug_unique
  ON lawyer_profiles (slug)
  WHERE slug IS NOT NULL;

-- Простая проверка формата slug: только латиница, цифры, дефис, 3–40 символов.
-- Не строгая (без regex констрейнта на enum), но защита от пробелов и спецов.
ALTER TABLE lawyer_profiles
  DROP CONSTRAINT IF EXISTS lawyer_profiles_slug_format;
ALTER TABLE lawyer_profiles
  ADD CONSTRAINT lawyer_profiles_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');
