-- Add new values to forum_topic_type enum
ALTER TYPE forum_topic_type ADD VALUE IF NOT EXISTS 'legal';
ALTER TYPE forum_topic_type ADD VALUE IF NOT EXISTS 'health';
ALTER TYPE forum_topic_type ADD VALUE IF NOT EXISTS 'general';