-- Add rate limiting indexes for contact submissions
-- This helps prevent spam and abuse

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at 
ON contact_submissions(created_at);

-- Create index on email for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email_created 
ON contact_submissions(email, created_at);

-- Add index on forum_posts for rate limiting
CREATE INDEX IF NOT EXISTS idx_forum_posts_user_created 
ON forum_posts(user_id, created_at);

-- Add index on testimonials for rate limiting
CREATE INDEX IF NOT EXISTS idx_testimonials_created 
ON testimonials(created_at);

-- Add character limits as table comments for documentation
COMMENT ON COLUMN contact_submissions.name IS 'Max 100 characters';
COMMENT ON COLUMN contact_submissions.phone IS 'Max 18 characters';
COMMENT ON COLUMN contact_submissions.email IS 'Max 255 characters';
COMMENT ON COLUMN contact_submissions.message IS 'Max 2000 characters';

COMMENT ON COLUMN forum_posts.title IS 'Max 200 characters';
COMMENT ON COLUMN forum_posts.content IS 'Max 5000 characters';

COMMENT ON COLUMN testimonials.content IS 'Max 1000 characters';