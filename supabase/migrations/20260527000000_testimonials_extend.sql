-- Расширение схемы testimonials для редакторской вёрстки на лендинге:
-- добавляем возраст / город / категорию услуг / статью №565 / фото / видео /
-- порядок отображения / фичеринг. Существующие записи не теряют данных.

ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 17 AND age <= 50),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS article_565 TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_testimonials_status_featured_order
  ON public.testimonials (status, featured DESC, display_order, created_at DESC);

-- Сидим базовый набор отзывов под защитой ON CONFLICT — нужно только если таблица пустая,
-- чтобы лендинг не показывал пустой блок до того, как админ соберёт реальные отзывы.
INSERT INTO public.testimonials
  (author_name, content, status, rating, age, city, category, article_565, featured, display_order, approved_at)
SELECT * FROM (VALUES
  (
    'Дмитрий К.',
    'Получили категорию В за 4 месяца. Военкомат игнорировал диагноз — юрист подготовил независимую экспертизу и обжаловал решение в комиссии субъекта. Без её участия точно бы забрали.',
    'approved', 5, 22, 'Москва', 'Юридическое сопровождение', 'ст. 66 «г»', TRUE, 1, NOW()
  ),
  (
    'Александр М.',
    'Думал, что ИИ-кабинет — это маркетинг. Оказалось — реальный инструмент: загрузил справки, получил привязку к статьям 565 и план действий. С юристом потом обсудили только спорные моменты. Это экономия 30 тысяч на консультациях.',
    'approved', 5, 21, 'Санкт-Петербург', 'ИИ-кабинет', 'ст. 43', TRUE, 2, NOW()
  ),
  (
    'Максим В.',
    'Дело шло год. Сначала отсрочка, потом обжалование, потом независимая экспертиза. В итоге — военный билет. Каждый шаг был согласован, никаких сюрпризов. Возврат гонорара не понадобился, но сам факт того, что он прописан в договоре — это про доверие.',
    'approved', 5, 20, 'Екатеринбург', 'Полное сопровождение', 'ст. 71', TRUE, 3, NOW()
  )
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials WHERE status = 'approved');

COMMENT ON COLUMN public.testimonials.article_565 IS 'Статья Расписания болезней (Постановление №565), к которой относится дело — для усиления экспертности.';
COMMENT ON COLUMN public.testimonials.category IS 'Категория услуги: «Юридическое сопровождение», «ИИ-кабинет», «Полное сопровождение» и т.п.';
COMMENT ON COLUMN public.testimonials.video_url IS 'URL видео-отзыва (YouTube/VK Video) — при наличии рендерим lite-embed.';
COMMENT ON COLUMN public.testimonials.featured IS 'Закрепить на главной странице.';
COMMENT ON COLUMN public.testimonials.display_order IS 'Порядок сортировки (меньше = выше).';
