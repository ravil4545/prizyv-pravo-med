-- Create medical_tests table for storing user's medical test records
CREATE TABLE public.medical_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  test_name TEXT NOT NULL,
  test_date DATE,
  ai_summary TEXT,
  user_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.medical_tests ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own medical tests"
ON public.medical_tests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own medical tests"
ON public.medical_tests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medical tests"
ON public.medical_tests
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medical tests"
ON public.medical_tests
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_medical_tests_updated_at
BEFORE UPDATE ON public.medical_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_medical_tests_user_id ON public.medical_tests(user_id);
CREATE INDEX idx_medical_tests_test_date ON public.medical_tests(test_date);