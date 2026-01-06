-- Make medical-documents bucket public to allow image viewing
UPDATE storage.buckets SET public = true WHERE id = 'medical-documents';