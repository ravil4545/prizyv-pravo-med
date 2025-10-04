-- Create storage bucket for blog images
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true);

-- Add image_url column to blog_posts if it doesn't exist
ALTER TABLE public.blog_posts 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create RLS policies for blog images
CREATE POLICY "Anyone can view blog images"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

CREATE POLICY "Admins can upload blog images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'blog-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update blog images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'blog-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete blog images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'blog-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);