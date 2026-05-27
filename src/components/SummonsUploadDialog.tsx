import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Camera, FileWarning, Calendar, MapPin, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface ParsedSummons {
  event_date?: string;
  event_time?: string;
  office_name?: string;
  office_address?: string;
  recipient_name?: string;
  reason?: string;
  reason_text?: string;
  confidence?: number;
  warnings?: string[];
  createdEventId?: string | null;
}

interface SummonsUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

/**
 * Диалог загрузки повестки с автоматическим распознаванием через
 * edge-функцию parse-summons. При успехе автоматически создаётся
 * запись в case_events.
 */
export default function SummonsUploadDialog({
  open,
  onOpenChange,
  onCreated,
}: SummonsUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParsedSummons | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setFile(null);
    setResult(null);
    setErrorMsg(null);
    setParsing(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setErrorMsg(null);
  };

  /** Конвертирует PDF/image → base64 JPEG для отправки в Vision-модель */
  const fileToBase64Jpeg = async (f: File): Promise<string> => {
    if (f.type === "application/pdf") {
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return new Promise<string>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("PDF→JPEG failed"));
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.92,
        );
      });
    }
    // Изображение — конвертируем в JPEG через canvas
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 2000;
          let { width, height } = img;
          if (Math.max(width, height) > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width *= scale;
            height *= scale;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("image→JPEG failed"));
              const fr = new FileReader();
              fr.onload = () => resolve((fr.result as string).split(",")[1]);
              fr.onerror = reject;
              fr.readAsDataURL(blob);
            },
            "image/jpeg",
            0.9,
          );
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setErrorMsg(null);
    try {
      const base64 = await fileToBase64Jpeg(file);
      const { data, error } = await supabase.functions.invoke("parse-summons", {
        body: { imageBase64: base64, autoCreateEvent: true },
      });
      if (error) throw error;
      if (data?.error === "not_a_summons") {
        setErrorMsg("Документ не похож на повестку. Загрузите фото повестки из военкомата.");
        return;
      }
      if (data?.error) {
        setErrorMsg(`Ошибка распознавания: ${data.error}`);
        return;
      }
      setResult(data as ParsedSummons);
      if (data?.createdEventId) {
        toast({
          title: "Событие добавлено",
          description: "Повестка добавлена в таймлайн вашего дела",
        });
        onCreated?.();
      }
    } catch (err) {
      console.error("Summons parse error", err);
      setErrorMsg(err instanceof Error ? err.message : "Ошибка обработки");
    } finally {
      setParsing(false);
    }
  };

  const REASON_LABELS: Record<string, string> = {
    medical: "Медицинское освидетельствование",
    clarification: "Уточнение сведений",
    conscription: "Отправка к месту службы",
    other: "Другое",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Распознать повестку</DialogTitle>
          <DialogDescription>
            Загрузите фото или PDF повестки — ИИ извлечёт дату, военкомат и повод, и добавит
            событие в таймлайн дела.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gold/40 rounded-xl p-6 text-center cursor-pointer hover:border-gold/70 hover:bg-gold/5 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Camera className="h-8 w-8 mx-auto text-gold-deep mb-2" />
              <p className="text-sm font-medium text-foreground">
                {file ? file.name : "Нажмите для выбора файла"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF — до 10 МБ</p>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-seal/10 border border-seal/30 text-xs text-seal">
                <FileWarning className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleParse}
                disabled={!file || parsing}
                className="bg-gold-deep hover:bg-gold-deep/90 text-paper"
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Распознаю…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Распознать
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {result && (
          <>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-success/15 text-success border-success/30">
                  Распознано · {result.confidence ?? "?"}%
                </Badge>
                {result.createdEventId && (
                  <Badge variant="outline" className="border-gold/40">
                    Добавлено в таймлайн
                  </Badge>
                )}
              </div>
              {result.event_date && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-gold-deep mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Дата явки</p>
                    <p className="text-sm font-semibold">
                      {result.event_date}
                      {result.event_time ? ` · ${result.event_time}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {result.office_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-gold-deep mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Военкомат</p>
                    <p className="text-sm">{result.office_name}</p>
                  </div>
                </div>
              )}
              {result.office_address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gold-deep mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Адрес</p>
                    <p className="text-sm">{result.office_address}</p>
                  </div>
                </div>
              )}
              {result.reason && (
                <div className="text-sm">
                  <span className="text-xs text-muted-foreground">Повод: </span>
                  {REASON_LABELS[result.reason] || result.reason}
                </div>
              )}
              {result.warnings && result.warnings.length > 0 && (
                <div className="text-xs text-seal space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Готово</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
