-- Strengthen contact_submissions security
-- Current policies are correct but we'll add extra protection and documentation

-- Add DELETE policy for admins (currently missing)
CREATE POLICY "Admins can delete submissions"
ON contact_submissions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add explicit documentation about security model
COMMENT ON TABLE contact_submissions IS 
'Contains sensitive customer contact information (PII). 
Access is restricted:
- SELECT: Admin role only
- INSERT: Public (required for contact form)
- UPDATE: Admin role only
- DELETE: Admin role only
RLS is ENABLED to enforce these restrictions.';

-- Add security audit trail columns for better tracking
ALTER TABLE contact_submissions 
ADD COLUMN IF NOT EXISTS ip_address inet,
ADD COLUMN IF NOT EXISTS user_agent text;

-- Create a function to log contact form submissions
CREATE OR REPLACE FUNCTION log_contact_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Add basic audit info
  NEW.ip_address := inet_client_addr();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log submissions
DROP TRIGGER IF EXISTS log_contact_submission_trigger ON contact_submissions;
CREATE TRIGGER log_contact_submission_trigger
BEFORE INSERT ON contact_submissions
FOR EACH ROW
EXECUTE FUNCTION log_contact_submission();

-- Add index for admin queries
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status 
ON contact_submissions(status, created_at DESC);

-- Verify RLS is enabled (should already be true)
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner as well (extra protection)
ALTER TABLE contact_submissions FORCE ROW LEVEL SECURITY;