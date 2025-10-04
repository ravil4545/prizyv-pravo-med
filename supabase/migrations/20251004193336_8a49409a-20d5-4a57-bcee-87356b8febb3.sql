-- Расширяем таблицу profiles дополнительными полями
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_series TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_issued_by TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_issue_date DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS passport_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_place TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS actual_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region TEXT;

-- Данные об образовании
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS education_institution TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS education_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS education_specialty TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS education_course TEXT;

-- Данные о работе
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_place TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_position TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_address TEXT;

-- Военкомат и госструктуры
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS military_commissariat TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS military_commissariat_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS superior_military_commissariat TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS superior_military_commissariat_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS court_by_military TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS court_by_registration TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS prosecutor_office TEXT;

-- Создаём таблицу для диагнозов пользователя
CREATE TABLE IF NOT EXISTS public.user_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  diagnosis_name TEXT NOT NULL,
  diagnosis_code TEXT,
  medical_documents TEXT,
  ai_fitness_category TEXT,
  user_article TEXT,
  user_fitness_category TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Включаем RLS для таблицы диагнозов
ALTER TABLE public.user_diagnoses ENABLE ROW LEVEL SECURITY;

-- Политики для user_diagnoses
CREATE POLICY "Users can view their own diagnoses"
  ON public.user_diagnoses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own diagnoses"
  ON public.user_diagnoses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own diagnoses"
  ON public.user_diagnoses
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own diagnoses"
  ON public.user_diagnoses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_user_diagnoses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_diagnoses_updated_at_trigger
  BEFORE UPDATE ON public.user_diagnoses
  FOR EACH ROW
  EXECUTE FUNCTION update_user_diagnoses_updated_at();