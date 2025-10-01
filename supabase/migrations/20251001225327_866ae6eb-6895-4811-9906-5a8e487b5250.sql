-- Fix contact_submissions RLS policies to use RESTRICTIVE mode for stronger security
-- RESTRICTIVE policies require ALL policies to pass (AND logic) instead of ANY (OR logic)

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Admins can view all submissions" ON contact_submissions;
DROP POLICY IF EXISTS "Anyone can create submissions" ON contact_submissions;
DROP POLICY IF EXISTS "Admins can update submissions" ON contact_submissions;
DROP POLICY IF EXISTS "Admins can delete submissions" ON contact_submissions;

-- Recreate as RESTRICTIVE policies for stronger security guarantees
CREATE POLICY "Admins can view all submissions" ON contact_submissions
  AS RESTRICTIVE FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can create submissions" ON contact_submissions
  AS RESTRICTIVE FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can update submissions" ON contact_submissions
  AS RESTRICTIVE FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete submissions" ON contact_submissions
  AS RESTRICTIVE FOR DELETE
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));