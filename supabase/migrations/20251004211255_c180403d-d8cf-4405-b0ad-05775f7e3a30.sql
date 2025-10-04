-- Create storage bucket for user medical documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-documents', 'medical-documents', false);

-- Create RLS policies for medical documents bucket
CREATE POLICY "Users can view their own medical documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'medical-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own medical documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'medical-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own medical documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'medical-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create table for medical documents metadata
CREATE TABLE public.medical_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('analysis', 'examination', 'consultation')),
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  extracted_text TEXT,
  ai_analysis JSONB,
  ai_fitness_category TEXT,
  ai_recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on medical_documents table
ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for medical_documents
CREATE POLICY "Users can view their own medical documents"
ON public.medical_documents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own medical documents"
ON public.medical_documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medical documents"
ON public.medical_documents FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medical documents"
ON public.medical_documents FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_medical_documents_updated_at
BEFORE UPDATE ON public.medical_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();