import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCw, Loader2 } from "lucide-react";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfViewerProps {
  url: string;
  className?: string;
}

export default function PdfViewer({ url, className = "" }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check if URL is a PDF or image - strip query params before checking extension
        const urlWithoutParams = url.split('?')[0];
        const isPdf = urlWithoutParams.toLowerCase().endsWith('.pdf') || url.includes('application/pdf');
        
        if (!isPdf) {
          // For images, we'll display them directly
          setLoading(false);
          return;
        }

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Не удалось загрузить документ");
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [url]);

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: scale * 1.5 }); // Base scale for quality
      
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d")!;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise;
    };

    renderPage();
  }, [pdf, currentPage, scale]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setScrollStart({
      x: containerRef.current.scrollLeft,
      y: containerRef.current.scrollTop
    });
    
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    
    const dx = panStart.x - e.clientX;
    const dy = panStart.y - e.clientY;
    
    containerRef.current.scrollLeft = scrollStart.x + dx;
    containerRef.current.scrollTop = scrollStart.y + dy;
  }, [isPanning, panStart, scrollStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handlers
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => {
    setScale(1);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  };

  // Check if it's an image (not PDF)
  const urlWithoutParams = url.split('?')[0];
  const isImage = !urlWithoutParams.toLowerCase().endsWith('.pdf') && !loading && !pdf;

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
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-t-lg border-b">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={scale >= 3}
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={resetZoom}
            className="h-8 w-8"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="h-8"
            >
              ←
            </Button>
            <span className="text-sm">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="h-8"
            >
              →
            </Button>
          </div>
        )}
      </div>

      {/* Viewer area */}
      <div
        ref={containerRef}
        className={`
          relative overflow-auto bg-muted/30 rounded-b-lg
          ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}
        `}
        style={{ maxHeight: '60vh', minHeight: '300px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center justify-center p-4 min-h-[300px]">
          {isImage ? (
            <img
              src={url}
              alt="Document"
              className="max-w-full h-auto shadow-lg"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.2s ease'
              }}
              draggable={false}
            />
          ) : (
            <canvas
              ref={canvasRef}
              className="shadow-lg"
              style={{
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-2">
        Зажмите левую кнопку мыши для перемещения
      </p>
    </div>
  );
}
