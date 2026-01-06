-- Добавляем новые типы документов: "Иные документы" и "Не знаю"
INSERT INTO public.document_types (code, name, description, is_active)
VALUES 
  ('other', 'Иные документы', 'Прочие медицинские документы', true),
  ('unknown', 'Не знаю', 'Тип документа будет определён ИИ автоматически', true)
ON CONFLICT (code) DO NOTHING;

-- Добавляем новые поля в medical_documents_v2 для AI анализа
ALTER TABLE public.medical_documents_v2 
ADD COLUMN IF NOT EXISTS ai_fitness_category TEXT,
ADD COLUMN IF NOT EXISTS ai_category_chance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_recommendations TEXT[],
ADD COLUMN IF NOT EXISTS ai_explanation TEXT,
ADD COLUMN IF NOT EXISTS linked_article_id UUID REFERENCES public.disease_articles_565(id);