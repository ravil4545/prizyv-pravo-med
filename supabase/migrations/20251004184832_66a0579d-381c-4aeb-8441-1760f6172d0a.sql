-- Create analytics events table
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'page_view', 'session_start', 'session_end'
  page_url TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address INET,
  country TEXT,
  city TEXT,
  device_type TEXT, -- 'mobile', 'tablet', 'desktop'
  browser TEXT,
  os TEXT,
  duration_seconds INTEGER, -- time spent on page
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public inserts (for tracking)
CREATE POLICY "Allow public analytics tracking"
ON public.analytics_events
FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Only admins can view analytics
CREATE POLICY "Admins can view all analytics"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Policy: Admins can delete old analytics
CREATE POLICY "Admins can delete analytics"
ON public.analytics_events
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Create aggregated analytics view for performance
CREATE OR REPLACE VIEW public.analytics_summary AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
  AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration
FROM public.analytics_events
GROUP BY DATE(created_at)
ORDER BY date DESC;