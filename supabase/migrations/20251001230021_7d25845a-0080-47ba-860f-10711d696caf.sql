-- Secure contact_submissions table to only allow insertions via edge function
-- Remove public INSERT policy and restrict to service role only

-- Drop the public INSERT policy
DROP POLICY IF EXISTS "Anyone can create submissions" ON contact_submissions;

-- Add comment to document that insertions must go through submit-contact edge function
COMMENT ON TABLE contact_submissions IS 'Contact form submissions. Insertions must be done via the submit-contact edge function which implements rate limiting and validation.';
