
-- Table for tracking anonymous demo visitors
CREATE TABLE public.demo_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_user_id uuid NOT NULL,
  session_id uuid,
  ip_address inet,
  user_agent text,
  browser text,
  os text,
  device_type text,
  city text,
  country text,
  document_uploads_used integer NOT NULL DEFAULT 0,
  ai_questions_used integer NOT NULL DEFAULT 0,
  pages_visited text[] DEFAULT '{}',
  first_visit_at timestamptz NOT NULL DEFAULT now(),
  last_visit_at timestamptz NOT NULL DEFAULT now(),
  converted_to_user boolean NOT NULL DEFAULT false,
  converted_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(anonymous_user_id)
);

-- Enable RLS
ALTER TABLE public.demo_visitors ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert/update their own records
CREATE POLICY "Anonymous users can insert their record"
ON public.demo_visitors FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anonymous users can update their record"
ON public.demo_visitors FOR UPDATE
USING (true);

CREATE POLICY "Anonymous users can view their record"
ON public.demo_visitors FOR SELECT
USING (true);

-- Admins can view all records
CREATE POLICY "Admins can manage demo visitors"
ON public.demo_visitors FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_demo_visitors_updated_at
BEFORE UPDATE ON public.demo_visitors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
