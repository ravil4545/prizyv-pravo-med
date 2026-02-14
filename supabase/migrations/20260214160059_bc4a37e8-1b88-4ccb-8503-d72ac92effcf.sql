-- Drop the broken log_contact_submission trigger and function
-- inet_client_addr() returns pooler IP, not end-user IP
DROP TRIGGER IF EXISTS log_contact_submission_trigger ON public.contact_submissions;
DROP FUNCTION IF EXISTS public.log_contact_submission();