-- Strengthen contact_submissions security with audit trail and documentation
-- RLS policies are already correctly configured

-- Add explicit documentation about security model
COMMENT ON TABLE contact_submissions IS 
'Contains sensitive customer contact information (PII). 
Access is restricted:
- SELECT: Admin role only (via has_role check)
- INSERT: Public (required for contact form)
- UPDATE: Admin role only (via has_role check)
- DELETE: Admin role only (via has_role check)
RLS is ENABLED and FORCED to enforce these restrictions.';

-- Add security audit trail columns for better tracking
ALTER TABLE contact_submissions 
ADD COLUMN IF NOT EXISTS ip_address inet,
ADD COLUMN IF NOT EXISTS user_agent text;

-- Create a function to log contact form submissions
CREATE OR REPLACE FUNCTION log_contact_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Add basic audit info (IP address from database connection)
  NEW.ip_address := inet_client_addr();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically log submissions
DROP TRIGGER IF EXISTS log_contact_submission_trigger ON contact_submissions;
CREATE TRIGGER log_contact_submission_trigger
BEFORE INSERT ON contact_submissions
FOR EACH ROW
EXECUTE FUNCTION log_contact_submission();

-- Add index for admin queries by status
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status 
ON contact_submissions(status, created_at DESC);

-- Force RLS for table owner as well (extra protection)
ALTER TABLE contact_submissions FORCE ROW LEVEL SECURITY;