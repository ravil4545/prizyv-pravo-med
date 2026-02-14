import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Extract storage file path from a full public URL or return as-is if already a path.
 */
export function extractFilePath(fileUrl: string): string {
  // If it's already a relative path (no http)
  if (!fileUrl.startsWith("http")) return fileUrl;

  // Extract path after /object/public/medical-documents/ or /object/sign/medical-documents/
  const match = fileUrl.match(/\/(?:object\/(?:public|sign)\/)?medical-documents\/(.+)/);
  return match ? match[1] : fileUrl;
}

/**
 * Get a signed URL for a medical document.
 */
export async function getSignedDocumentUrl(fileUrl: string): Promise<string | null> {
  const filePath = extractFilePath(fileUrl);

  const { data, error } = await supabase.storage.from("medical-documents").createSignedUrl(filePath, SIGNED_URL_EXPIRY);

  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Upload a file and return the storage path (not public URL).
 */
export async function uploadMedicalDocument(
  fileName: string,
  file: Blob,
  contentType = "application/pdf",
): Promise<string> {
  const { error } = await supabase.storage.from("medical-documents").upload(fileName, file, { contentType });

  if (error) throw error;

  return fileName; // Store path, not URL
}
