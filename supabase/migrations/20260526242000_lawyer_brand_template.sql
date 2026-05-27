-- Шаблон визуала персонального лендинга юриста. Один из трёх вариантов:
-- 'classic'   — карточка-визитка, тёплая, доверительная (palettе paper/ink/gold)
-- 'editorial' — газетный стиль (serif, тонкие линии, как сайт nepriziv.ru)
-- 'minimal'   — современный минимал (крупная типографика, белый/чёрный)

ALTER TABLE public.lawyer_profiles
  ADD COLUMN IF NOT EXISTS brand_template text DEFAULT 'classic'
    CHECK (brand_template IN ('classic', 'editorial', 'minimal'));

UPDATE public.lawyer_profiles SET brand_template = 'classic' WHERE brand_template IS NULL;

NOTIFY pgrst, 'reload schema';
