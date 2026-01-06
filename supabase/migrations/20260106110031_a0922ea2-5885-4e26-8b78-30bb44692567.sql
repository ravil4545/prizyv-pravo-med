-- Create junction table for document-article many-to-many relationship
CREATE TABLE public.document_article_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.medical_documents_v2(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.disease_articles_565(id) ON DELETE CASCADE,
  ai_fitness_category text,
  ai_category_chance integer DEFAULT 0,
  ai_recommendations text[] DEFAULT '{}',
  ai_explanation text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(document_id, article_id)
);

-- Enable RLS
ALTER TABLE public.document_article_links ENABLE ROW LEVEL SECURITY;

-- Create policies (access through document ownership)
CREATE POLICY "Users can view their document links"
ON public.document_article_links
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.medical_documents_v2
    WHERE medical_documents_v2.id = document_article_links.document_id
    AND medical_documents_v2.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their document links"
ON public.document_article_links
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.medical_documents_v2
    WHERE medical_documents_v2.id = document_article_links.document_id
    AND medical_documents_v2.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their document links"
ON public.document_article_links
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.medical_documents_v2
    WHERE medical_documents_v2.id = document_article_links.document_id
    AND medical_documents_v2.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_document_article_links_document ON public.document_article_links(document_id);
CREATE INDEX idx_document_article_links_article ON public.document_article_links(article_id);