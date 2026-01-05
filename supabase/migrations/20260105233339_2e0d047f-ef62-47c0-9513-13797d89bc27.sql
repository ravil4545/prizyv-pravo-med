
-- 1. Таблица типов документов
CREATE TABLE public.document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view document types"
ON public.document_types FOR SELECT USING (true);

CREATE POLICY "Admins can manage document types"
ON public.document_types FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Начальные данные типов документов
INSERT INTO public.document_types (code, name, description) VALUES
  ('analysis', 'Анализы', 'Лабораторные анализы'),
  ('examination', 'Обследования', 'Инструментальные обследования'),
  ('pnd_certificate', 'Справка ПНД', 'Справка из психоневрологического диспансера'),
  ('kvd_certificate', 'Справка КВД', 'Справка из кожно-венерологического диспансера'),
  ('form_027u', 'Форма 027/у', 'Выписка из медицинской карты'),
  ('form_025u', 'Форма 025/у', 'Медицинская карта амбулаторного больного'),
  ('discharge_inpatient', 'Выписка стационар', 'Выписка из стационара'),
  ('discharge_day_hospital', 'Выписка дневной стационар', 'Выписка из дневного стационара'),
  ('specialist_report', 'Заключение специалиста', 'Заключение врача-специалиста');

-- 2. Таблица подтипов документов (специалисты и обследования)
CREATE TABLE public.document_subtypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID REFERENCES public.document_types(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_document_subtypes_type ON public.document_subtypes(type_id);

ALTER TABLE public.document_subtypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view document subtypes"
ON public.document_subtypes FOR SELECT USING (true);

CREATE POLICY "Admins can manage document subtypes"
ON public.document_subtypes FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Начальные данные подтипов (специалисты)
INSERT INTO public.document_subtypes (code, name, description) VALUES
  ('therapist', 'Терапевт', 'Врач-терапевт'),
  ('gp', 'Врач общей практики', 'Врач общей практики'),
  ('cardiologist', 'Кардиолог', 'Врач-кардиолог'),
  ('arrhythmologist', 'Аритмолог', 'Врач-аритмолог'),
  ('gastroenterologist', 'Гастроэнтеролог', 'Врач-гастроэнтеролог'),
  ('orthopedist', 'Ортопед', 'Врач-ортопед'),
  ('surgeon', 'Хирург', 'Врач-хирург'),
  ('ophthalmologist', 'Офтальмолог', 'Врач-офтальмолог'),
  ('neurologist', 'Невролог', 'Врач-невролог'),
  ('psychiatrist', 'Психиатр', 'Врач-психиатр'),
  ('ekg', 'ЭКГ', 'Электрокардиография'),
  ('echo_kg', 'ЭхоКГ', 'Эхокардиография'),
  ('holter', 'Холтер', 'Холтеровское мониторирование'),
  ('ultrasound', 'УЗИ', 'Ультразвуковое исследование'),
  ('xray', 'Рентген', 'Рентгенография'),
  ('mri', 'МРТ', 'Магнитно-резонансная томография'),
  ('ct', 'КТ', 'Компьютерная томография');

-- 3. Таблица статей Постановления №565
CREATE TABLE public.disease_articles_565 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_disease_articles_565_article_number ON public.disease_articles_565(article_number);
CREATE INDEX idx_disease_articles_565_category ON public.disease_articles_565(category);

ALTER TABLE public.disease_articles_565 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active articles"
ON public.disease_articles_565 FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage articles"
ON public.disease_articles_565 FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 4. Таблица правил связи статей с документами
CREATE TABLE public.article_document_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.disease_articles_565(id) ON DELETE CASCADE,
  document_type_id UUID REFERENCES public.document_types(id) ON DELETE SET NULL,
  document_subtype_id UUID REFERENCES public.document_subtypes(id) ON DELETE SET NULL,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_article_document_rules_article ON public.article_document_rules(article_id);
CREATE INDEX idx_article_document_rules_type ON public.article_document_rules(document_type_id);
CREATE INDEX idx_article_document_rules_subtype ON public.article_document_rules(document_subtype_id);

ALTER TABLE public.article_document_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view document rules"
ON public.article_document_rules FOR SELECT USING (true);

CREATE POLICY "Admins can manage document rules"
ON public.article_document_rules FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 5. Таблица оценок пользователей по статьям
CREATE TABLE public.article_user_assessment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  article_id UUID NOT NULL REFERENCES public.disease_articles_565(id) ON DELETE CASCADE,
  score_v NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX idx_article_user_assessment_user ON public.article_user_assessment(user_id);
CREATE INDEX idx_article_user_assessment_article ON public.article_user_assessment(article_id);

ALTER TABLE public.article_user_assessment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own assessments"
ON public.article_user_assessment FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assessments"
ON public.article_user_assessment FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assessments"
ON public.article_user_assessment FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assessments"
ON public.article_user_assessment FOR DELETE USING (auth.uid() = user_id);

-- Триггеры обновления updated_at
CREATE TRIGGER update_disease_articles_565_updated_at
BEFORE UPDATE ON public.disease_articles_565
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_article_document_rules_updated_at
BEFORE UPDATE ON public.article_document_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_article_user_assessment_updated_at
BEFORE UPDATE ON public.article_user_assessment
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
