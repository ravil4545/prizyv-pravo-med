
-- Таблица загруженных медицинских документов пользователей
CREATE TABLE public.medical_documents_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  document_date DATE,
  title TEXT,
  document_type_id UUID REFERENCES public.document_types(id) ON DELETE SET NULL,
  document_subtype_id UUID REFERENCES public.document_subtypes(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  raw_text TEXT,
  meta JSONB DEFAULT '{}',
  is_classified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_medical_documents_v2_user ON public.medical_documents_v2(user_id);
CREATE INDEX idx_medical_documents_v2_date ON public.medical_documents_v2(document_date DESC);
CREATE INDEX idx_medical_documents_v2_type ON public.medical_documents_v2(document_type_id);

-- RLS
ALTER TABLE public.medical_documents_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own documents"
ON public.medical_documents_v2 FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
ON public.medical_documents_v2 FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON public.medical_documents_v2 FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.medical_documents_v2 FOR DELETE USING (auth.uid() = user_id);

-- Триггер updated_at
CREATE TRIGGER update_medical_documents_v2_updated_at
BEFORE UPDATE ON public.medical_documents_v2
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
