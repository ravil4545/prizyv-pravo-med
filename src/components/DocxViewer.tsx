import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import mammoth from "mammoth";

interface DocxViewerProps {
  url: string;
  className?: string;
}

export default function DocxViewer({ url, className = "" }: DocxViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocx = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setHtml(result.value);
      } catch (err) {
        console.error("Error loading DOCX:", err);
        setError("Не удалось загрузить документ DOCX");
      } finally {
        setLoading(false);
      }
    };

    loadDocx();
  }, [url]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-64 text-destructive ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      <div
        className="p-6 prose prose-sm max-w-none text-black"
        style={{ maxHeight: "60vh", overflow: "auto" }}
        dangerouslySetInnerHTML={{ __html: html || "" }}
      />
    </div>
  );
}
