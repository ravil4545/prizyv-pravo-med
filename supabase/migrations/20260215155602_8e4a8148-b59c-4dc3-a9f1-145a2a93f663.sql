
-- Drop the existing check constraint on status and re-add with 'payment_click' allowed
ALTER TABLE public.contact_submissions DROP CONSTRAINT IF EXISTS contact_submissions_status_check;
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_status_check 
  CHECK (status IN ('new', 'in_progress', 'resolved', 'spam', 'payment_click'));

-- Add payment tracking column to user_subscriptions
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS payment_link_clicked_at timestamp with time zone DEFAULT NULL;
