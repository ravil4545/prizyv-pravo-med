-- Add folder and tags columns to medical_documents_v2
ALTER TABLE medical_documents_v2
  ADD COLUMN IF NOT EXISTS folder text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Index for folder queries
CREATE INDEX IF NOT EXISTS idx_medical_documents_v2_folder
  ON medical_documents_v2(user_id, folder);

-- Add likes to forum_posts
CREATE TABLE IF NOT EXISTS forum_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE forum_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own likes" ON forum_post_likes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view likes" ON forum_post_likes
  FOR SELECT USING (true);

-- Case tracking table
CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('commission', 'appeal', 'court', 'medical', 'document', 'other')),
  title text NOT NULL,
  description text,
  outcome text CHECK (outcome IN ('positive', 'negative', 'pending', null)),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own case events" ON case_events
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Successful cases base (anonymous)
CREATE TABLE IF NOT EXISTS success_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_codes text[] NOT NULL DEFAULT '{}',
  fitness_category text NOT NULL,
  outcome text NOT NULL,
  description text NOT NULL,
  region text,
  year int,
  is_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE success_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved cases" ON success_cases
  FOR SELECT USING (is_approved = true);

CREATE POLICY "Authenticated users can submit cases" ON success_cases
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Commissariat ratings
CREATE TABLE IF NOT EXISTS commissariat_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commissariat_name text NOT NULL,
  city text NOT NULL,
  region text,
  rating int CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commissariat_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ratings" ON commissariat_ratings
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can add ratings" ON commissariat_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
