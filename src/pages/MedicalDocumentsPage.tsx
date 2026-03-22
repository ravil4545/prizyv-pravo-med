import { useState, useEffect, useCallback, useRef } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useDemoMode } from "@/hooks/useDemoMode";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PdfViewer from "@/components/PdfViewer";
import DocxViewer from "@/components/DocxViewer";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Loader2,
  Trash2,
  Download,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Eye,
  Brain,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Printer,
  FileStack,
  File,
  PenLine,
  Plus,
  CheckSquare,
  Square,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getSignedDocumentUrl, extractFilePath } from "@/lib/storage";

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface DocumentPart {
  name: string;
  type_id?: string;
  type_name?: string;
}

interface DocumentMeta {
  parts?: DocumentPart[];
}

interface MedicalDocument {
  id: string;
  title: string | null;
  file_url: string;
  document_date: string | null;
  uploaded_at: string;
  is_classified: boolean;
  document_type_id: string | null;
  raw_text: string | null;
  ai_fitness_category: string | null;
  ai_category_chance: number | null;
  ai_recommendations: string[] | null;
  ai_explanation: string | null;
  linked_article_id: string | null;
  meta: DocumentMeta | null;
  document_types?: DocumentType | null;
  disease_articles_565?: { article_number: string; title: string } | null;
}

type SortField = "uploaded_at" | "document_date" | "title";
type SortDirection = "asc" | "desc";

function SignedDocumentViewer({ fileUrl }: { fileUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  // Check original file path for extension (signed URLs have query params)
  const isDocx = extractFilePath(fileUrl).toLowerCase().endsWith('.docx');
  useEffect(() => {
    getSignedDocumentUrl(fileUrl).then(setSignedUrl);
  }, [fileUrl]);
  if (!signedUrl)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (isDocx) {
    return <DocxViewer url={signedUrl} />;
  }
  return <PdfViewer url={signedUrl} />;
}

export default function MedicalDocumentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canUploadDocument, incrementDocumentUploads, isActive, remainingDocUploads } = useSubscription();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<MedicalDocument | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<"single" | "multi" | "handwritten" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [enhancing, setEnhancing] = useState(false);

  // Handwritten document form state
  const [handwrittenFiles, setHandwrittenFiles] = useState<File[]>([]);
  const [handwrittenForm, setHandwrittenForm] = useState({
    documentType: "",
    examination: "",
    conclusion: "",
    diagnosis: "",
  });

  // Filters & Sorting
  const [filterType, setFilterType] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("uploaded_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected document for details view
  const [selectedDocument, setSelectedDocument] = useState<MedicalDocument | null>(null);

  // Multi-select for deletion
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [showMultiDeleteConfirm, setShowMultiDeleteConfirm] = useState(false);

  // Add pages to existing document
  const [documentToAddPages, setDocumentToAddPages] = useState<MedicalDocument | null>(null);
  const [addPagesFiles, setAddPagesFiles] = useState<File[]>([]);
  const [addingPages, setAddingPages] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocuments();
      loadDocumentTypes();
    }
  }, [user]);

  const checkUser = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        // Allow demo access — don't redirect
        setLoading(false);
        return;
      }
      setUser(session.user);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentTypes = async () => {
    const { data, error } = await supabase.from("document_types").select("id, code, name").eq("is_active", true);

    if (!error && data) {
      setDocumentTypes(data);
    }
  };

  const loadDocuments = async () => {
    const { data, error } = await supabase
      .from("medical_documents_v2")
      .select(
        `
        id,
        title,
        file_url,
        document_date,
        uploaded_at,
        is_classified,
        document_type_id,
        raw_text,
        ai_fitness_category,
        ai_category_chance,
        ai_recommendations,
        ai_explanation,
        linked_article_id,
        meta,
        document_types (id, code, name),
        disease_articles_565 (article_number, title)
      `,
      )
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setDocuments(data as unknown as MedicalDocument[]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      // Используем текущий режим загрузки
      await uploadFiles(files, uploadMode === "multi");
    },
    [user, uploadMode],
  );

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, mode: "single" | "multi" | "handwritten") => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (mode === "handwritten") {
        // Для рукописного - добавляем файлы к существующим
        setHandwrittenFiles((prev) => [...prev, ...files]);
        return;
      }
      if (mode === "single") {
        // Для одностраничного - каждый файл отдельно
        await uploadFiles(files, false);
      } else {
        // Для многостраничного - все файлы в один PDF
        await uploadFiles(files, true);
      }
    }
    setUploadMode(null);
  };

  // Удаление файла из списка рукописных
  const removeHandwrittenFile = (index: number) => {
    setHandwrittenFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload handwritten document with manual text input
  const uploadHandwrittenDocument = async () => {
    if (!user) {
      toast({
        title: "Требуется регистрация",
        description: "Для загрузки документов необходимо войти или зарегистрироваться.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (handwrittenFiles.length === 0) return;

    const { documentType, examination, conclusion, diagnosis } = handwrittenForm;
    if (!documentType && !examination && !conclusion && !diagnosis) {
      toast({
        title: "Введите данные",
        description: "Заполните хотя бы одно поле для анализа",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Обрабатываем все файлы
      const processedImages: { base64: string; width: number; height: number }[] = [];

      for (let i = 0; i < handwrittenFiles.length; i++) {
        setUploadProgress(`Обработка страницы ${i + 1} из ${handwrittenFiles.length}...`);
        const file = handwrittenFiles[i];
        const { base64 } = await convertToJpeg(file);
        const compressedBase64 = await compressImage(base64);
        const dimensions = await getImageDimensions(compressedBase64);
        processedImages.push({ base64: compressedBase64, ...dimensions });
      }

      setUploadProgress("Создание PDF...");

      // Создаём PDF из всех страниц
      const pdfBlob = await createPdfFromImages(processedImages);

      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;

      // Загружаем PDF
      const { error: uploadError } = await supabase.storage.from("medical-documents").upload(fileName, pdfBlob, {
        contentType: "application/pdf",
      });

      if (uploadError) throw uploadError;

      const storedPath = fileName;

      // Формируем текст для анализа
      const manualText = [
        documentType ? `Вид документа: ${documentType}` : "",
        examination ? `Анализ/обследование/врач: ${examination}` : "",
        conclusion ? `Заключение: ${conclusion}` : "",
        diagnosis ? `Диагноз: ${diagnosis}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Создаём запись в базе
      const pagesText = handwrittenFiles.length > 1 ? `_${handwrittenFiles.length}_стр` : "";
      const { data: insertedDoc, error: insertError } = await supabase
        .from("medical_documents_v2")
        .insert({
          user_id: user.id,
          title: `Рукописный${pagesText}_${format(new Date(), "dd.MM.yyyy_HH-mm")}`,
          file_url: storedPath,
          is_classified: false,
          raw_text: manualText, // Сохраняем введённый пользователем текст
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: "Документ загружен",
        description: `${handwrittenFiles.length} стр. Запускаем AI-анализ введённого текста...`,
      });
      await incrementDocumentUploads();

      // Запускаем AI анализ на введённом тексте
      if (insertedDoc) {
        analyzeHandwrittenDocument(insertedDoc.id, manualText);
      }

      // Сбрасываем форму
      setHandwrittenFiles([]);
      setHandwrittenForm({ documentType: "", examination: "", conclusion: "", diagnosis: "" });
      setUploadMode(null);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress("");
      loadDocuments();
    }
  };

  // Analyze handwritten document based on user-entered text
  const analyzeHandwrittenDocument = async (documentId: string, manualText: string) => {
    setAnalyzingId(documentId);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-medical-document", {
        body: {
          manualText,
          documentId,
          userId: user.id,
          isHandwritten: true,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Ошибка анализа",
          description: data.message || "Попробуйте позже",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Анализ завершён",
          description: `Категория: ${data.fitnessCategory}, шанс категории В: ${data.categoryBChance}%`,
        });
      }

      loadDocuments();
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Ошибка анализа",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  // Конвертация файла в JPEG с максимальным качеством
  const convertToJpeg = async (file: File): Promise<{ blob: Blob; base64: string }> => {
    // Если это PDF, конвертируем первую страницу в JPEG
    if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Get original viewport
        const originalViewport = page.getViewport({ scale: 1.0 });

        // Calculate scale to limit max dimension to 2000px for API compatibility
        const maxDimension = 2000;
        const maxOriginal = Math.max(originalViewport.width, originalViewport.height);
        const scale = maxOriginal > maxDimension ? maxDimension / maxOriginal : 1.5;

        const viewport = page.getViewport({ scale });

        console.log(`PDF page size: ${Math.round(viewport.width)}x${Math.round(viewport.height)}`);

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext("2d")!;
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        return new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = (reader.result as string).split(",")[1];
                  resolve({ blob, base64 });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              } else {
                reject(new Error("Failed to convert PDF to JPEG"));
              }
            },
            "image/jpeg",
            0.95,
          );
        });
      } catch (error) {
        console.error("PDF conversion error:", error);
        throw new Error("Не удалось обработать PDF файл");
      }
    }

    // Для изображений конвертируем в JPEG
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const jpegReader = new FileReader();
                jpegReader.onload = () => {
                  const base64 = (jpegReader.result as string).split(",")[1];
                  resolve({ blob, base64 });
                };
                jpegReader.readAsDataURL(blob);
              } else {
                reject(new Error("Failed to convert image"));
              }
            },
            "image/jpeg",
            0.95,
          );
        };
        img.onerror = reject;
        img.src = result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Сжатие изображения для уменьшения размера файла (без изменения содержимого)
  const compressImage = async (base64: string, maxWidth: number = 2000): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");

        // Уменьшаем если слишком большое
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width, height);

        // Сжимаем с качеством 0.85 для уменьшения размера
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const result = (reader.result as string).split(",")[1];
                resolve(result);
              };
              reader.readAsDataURL(blob);
            } else {
              resolve(base64);
            }
          },
          "image/jpeg",
          0.85,
        );
      };
      img.onerror = () => resolve(base64);
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  };

  // Создание PDF из изображений
  const createPdfFromImages = async (images: { base64: string; width: number; height: number }[]): Promise<Blob> => {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
    });

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      // Рассчитываем размер страницы под изображение
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Масштабируем изображение под страницу
      const imgRatio = img.width / img.height;
      const pageRatio = pageWidth / pageHeight;

      let finalWidth, finalHeight;
      if (imgRatio > pageRatio) {
        finalWidth = pageWidth - 20;
        finalHeight = finalWidth / imgRatio;
      } else {
        finalHeight = pageHeight - 20;
        finalWidth = finalHeight * imgRatio;
      }

      const x = (pageWidth - finalWidth) / 2;
      const y = (pageHeight - finalHeight) / 2;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(`data:image/jpeg;base64,${img.base64}`, "JPEG", x, y, finalWidth, finalHeight);
    }

    return pdf.output("blob");
  };

  // Получение размеров изображения из base64
  const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: 800, height: 1100 }); // Дефолтный размер A4
      };
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  };

  const uploadFiles = async (files: File[], combineIntoOne: boolean = false) => {
    if (!user) {
      toast({
        title: "Требуется регистрация",
        description: "Для загрузки документов необходимо войти или зарегистрироваться.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (!canUploadDocument()) {
      toast({
        title: "Лимит исчерпан",
        description: "Вы использовали все бесплатные загрузки. Оформите подписку для продолжения.",
        variant: "destructive",
      });
      return;
    }


    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const validFiles = files.filter((f) => validTypes.includes(f.type) || f.name.toLowerCase().endsWith('.docx'));

    if (validFiles.length === 0) {
      toast({
        title: "Неподдерживаемый формат",
        description: "Загружайте PDF, DOCX или изображения (JPEG, PNG, WebP)",
        variant: "destructive",
      });
      return;
    }

    // Separate DOCX files - they get uploaded directly without conversion
    const docxFiles = validFiles.filter((f) => f.name.toLowerCase().endsWith('.docx') || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const otherFiles = validFiles.filter((f) => !f.name.toLowerCase().endsWith('.docx') && f.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    // Upload DOCX files directly
    if (docxFiles.length > 0) {
      setUploading(true);
      try {
        for (const file of docxFiles) {
          setUploadProgress(`Загрузка ${file.name}...`);
          const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.docx`;
          const { error: uploadError } = await supabase.storage.from("medical-documents").upload(fileName, file, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          if (uploadError) throw uploadError;

          // Extract text from DOCX using mammoth
          let extractedText = "";
          try {
            const mammoth = await import("mammoth");
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.default.extractRawText({ arrayBuffer });
            extractedText = result.value;
          } catch (e) {
            console.error("Failed to extract DOCX text:", e);
          }

          const { data: insertedDoc, error: insertError } = await supabase
            .from("medical_documents_v2")
            .insert({
              user_id: user.id,
              title: file.name.replace(/\.docx$/i, ""),
              file_url: fileName,
              is_classified: false,
              raw_text: extractedText || null,
            })
            .select()
            .single();
          if (insertError) throw insertError;

          toast({ title: "Документ загружен", description: `${file.name}. Запускаем AI-анализ...` });
          await incrementDocumentUploads();

          // Analyze using extracted text (handwritten mode)
          if (insertedDoc && extractedText) {
            analyzeHandwrittenDocument(insertedDoc.id, extractedText);
          }
        }
      } catch (error: any) {
        toast({ title: "Ошибка загрузки", description: error.message, variant: "destructive" });
      } finally {
        setUploading(false);
        setUploadProgress("");
        loadDocuments();
      }
    }

    if (otherFiles.length === 0) return;

    setUploading(true);
    setEnhancing(true);

    try {
      if (combineIntoOne) {
        // Многостраничный режим - объединяем все в один PDF
        const enhancedImages: { base64: string; width: number; height: number }[] = [];

        for (let i = 0; i < otherFiles.length; i++) {
          const file = otherFiles[i];
          setUploadProgress(`Обработка файла ${i + 1} из ${otherFiles.length}...`);

          // Конвертируем в JPEG
          const { base64 } = await convertToJpeg(file);

          // Сжимаем для уменьшения размера (без изменения содержимого)
          const compressedBase64 = await compressImage(base64);
          const dimensions = await getImageDimensions(compressedBase64);

          enhancedImages.push({ base64: compressedBase64, ...dimensions });
        }

        setUploadProgress("Создание PDF документа...");

        // Создаём PDF
        const pdfBlob = await createPdfFromImages(enhancedImages);

        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;

        // Загружаем PDF
        const { error: uploadError } = await supabase.storage.from("medical-documents").upload(fileName, pdfBlob, {
          contentType: "application/pdf",
        });

        if (uploadError) throw uploadError;

        const storedPath = fileName;

        // Создаём запись в базе
        const { data: insertedDoc, error: insertError } = await supabase
          .from("medical_documents_v2")
          .insert({
            user_id: user.id,
            title: `Документ_${otherFiles.length}_стр_${format(new Date(), "dd.MM.yyyy")}`,
            file_url: storedPath,
            is_classified: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        toast({
          title: "Документ загружен",
          description: `${otherFiles.length} страниц объединено в PDF. Запускаем AI-анализ...`,
        });
        await incrementDocumentUploads();

        // Запускаем AI анализ на первой странице
        if (insertedDoc && enhancedImages.length > 0) {
          analyzeDocument(insertedDoc.id, enhancedImages[0].base64);
        }
      } else {
        // Одностраничный режим - каждый файл отдельно
        for (let i = 0; i < otherFiles.length; i++) {
          const file = otherFiles[i];
          setUploadProgress(`Обработка файла ${i + 1} из ${otherFiles.length}...`);

          try {
            // Конвертируем в JPEG
            const { base64 } = await convertToJpeg(file);

            // Сжимаем для уменьшения размера (без изменения содержимого)
            const compressedBase64 = await compressImage(base64);

            setUploadProgress("Создание PDF...");

            // Создаём одностраничный PDF
            const dimensions = await getImageDimensions(compressedBase64);
            const pdfBlob = await createPdfFromImages([{ base64: compressedBase64, ...dimensions }]);

            const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;

            // Загружаем PDF
            const { error: uploadError } = await supabase.storage.from("medical-documents").upload(fileName, pdfBlob, {
              contentType: "application/pdf",
            });

            if (uploadError) throw uploadError;

            const storedPath = fileName;

            // Создаём запись в базе
            const { data: insertedDoc, error: insertError } = await supabase
              .from("medical_documents_v2")
              .insert({
                user_id: user.id,
                title: file.name.replace(/\.[^/.]+$/, "") + ".pdf",
                file_url: storedPath,
                is_classified: false,
              })
              .select()
              .single();

            if (insertError) throw insertError;

            toast({
              title: "Документ загружен",
              description: "Запускаем AI-анализ...",
            });
            await incrementDocumentUploads();

            // Запускаем AI анализ
            if (insertedDoc) {
              analyzeDocument(insertedDoc.id, compressedBase64);
            }
          } catch (error: any) {
            toast({
              title: "Ошибка загрузки",
              description: error.message,
              variant: "destructive",
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setEnhancing(false);
      setUploadProgress("");
      loadDocuments();
    }
  };

  const handleAnalysisError = (data: any) => {
    let toastTitle = "Ошибка анализа";
    let toastDescription = data.message || "Попробуйте позже";
    switch (data.error) {
      case "image_processing_error":
        toastTitle = "Не удалось распознать изображение";
        toastDescription = "Попробуйте загрузить документ в другом формате (JPG, PNG) или используйте режим «Рукописный документ» для ручного ввода текста.";
        break;
      case "rate_limit":
        toastTitle = "Превышен лимит запросов";
        toastDescription = "Подождите несколько минут и попробуйте снова.";
        break;
      case "payment_required":
        toastTitle = "Ошибка сервиса AI";
        toastDescription = "Временные проблемы с сервисом. Попробуйте позже.";
        break;
    }
    toast({ title: toastTitle, description: toastDescription, variant: "destructive" });
  };

  const analyzeDocument = async (documentId: string, imageBase64?: string) => {
    setAnalyzingId(documentId);

    try {
      const doc = documents.find((d) => d.id === documentId);

      // If document has raw_text (questionnaires, previously extracted), use text-only analysis
      if (doc?.raw_text && doc.raw_text.length > 100) {
        const { data, error } = await supabase.functions.invoke("analyze-medical-document", {
          body: {
            manualText: doc.raw_text,
            documentId,
            userId: user.id,
            isHandwritten: true,
          },
        });

        if (error) throw error;

        if (data.error) {
          handleAnalysisError(data);
        } else {
          toast({
            title: "Анализ завершён",
            description: `Категория: ${data.fitnessCategory}, шанс категории В: ${data.categoryBChance}%`,
          });
        }

        loadDocuments();
        return;
      }

      let base64 = imageBase64;

      // Если base64 не передан, загружаем из URL
      if (!base64) {
        if (!doc) throw new Error("Документ не найден");

        const signedUrl = await getSignedDocumentUrl(doc.file_url);
        if (!signedUrl) throw new Error("Не удалось получить доступ к файлу");
        const response = await fetch(signedUrl);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const { data, error } = await supabase.functions.invoke("analyze-medical-document", {
        body: { imageBase64: base64, documentId, userId: user.id },
      });

      if (error) throw error;

      if (data.error) {
        handleAnalysisError(data);
      } else {
        toast({
          title: "Анализ завершён",
          description: `Категория: ${data.fitnessCategory}, шанс категории В: ${data.categoryBChance}%`,
        });
      }

      loadDocuments();
    } catch (error: any) {
      console.error("Analysis error:", error);

      // Handle edge function errors
      let errorMessage = error.message || "Произошла ошибка при анализе";

      // Check for common error patterns
      if (errorMessage.includes("non-2xx status code") || errorMessage.includes("FunctionsHttpError")) {
        errorMessage = "Ошибка сервера. Попробуйте повторить анализ через несколько секунд.";
      }

      toast({
        title: "Ошибка анализа",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const filePath = extractFilePath(documentToDelete.file_url);

      await supabase.storage.from("medical-documents").remove([filePath]);

      // Удаляем связи из document_article_links
      await supabase.from("document_article_links").delete().eq("document_id", documentToDelete.id);

      const { error } = await supabase.from("medical_documents_v2").delete().eq("id", documentToDelete.id);

      if (error) throw error;

      toast({
        title: "Документ удалён",
        description: documentToDelete.title || "Без названия",
      });

      loadDocuments();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDocumentToDelete(null);
    }
  };

  // Multi-delete selected documents
  const confirmDeleteMultiple = async () => {
    if (selectedDocIds.size === 0) return;

    try {
      const docsToDelete = documents.filter((d) => selectedDocIds.has(d.id));

      // Удаляем файлы из хранилища
      const filePaths = docsToDelete.map((doc) => extractFilePath(doc.file_url));

      await supabase.storage.from("medical-documents").remove(filePaths);

      // Удаляем связи
      for (const docId of selectedDocIds) {
        await supabase.from("document_article_links").delete().eq("document_id", docId);
      }

      // Удаляем записи из БД
      const { error } = await supabase.from("medical_documents_v2").delete().in("id", Array.from(selectedDocIds));

      if (error) throw error;

      toast({
        title: "Документы удалены",
        description: `Удалено ${selectedDocIds.size} документов`,
      });

      setSelectedDocIds(new Set());
      loadDocuments();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setShowMultiDeleteConfirm(false);
    }
  };

  // Toggle document selection
  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedDocIds.size === filteredDocuments.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(filteredDocuments.map((d) => d.id)));
    }
  };

  // Add pages to existing document
  const handleAddPagesFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAddPagesFiles((prev) => [...prev, ...files]);
    }
  };

  const addPagesToDocument = async () => {
    if (!documentToAddPages || addPagesFiles.length === 0 || !user) return;

    setAddingPages(true);
    setUploadProgress("Загрузка исходного документа...");

    try {
      // Загружаем исходный PDF и извлекаем все страницы как изображения
      const existingImages: { base64: string; width: number; height: number }[] = [];

      const signedUrl = await getSignedDocumentUrl(documentToAddPages.file_url);
      if (!signedUrl) throw new Error("Не удалось получить доступ к файлу");
      const response = await fetch(signedUrl);
      const existingPdfBlob = await response.blob();
      const existingPdfData = await existingPdfBlob.arrayBuffer();

      const existingPdf = await pdfjsLib.getDocument({ data: existingPdfData }).promise;
      const existingPageCount = existingPdf.numPages;

      for (let i = 1; i <= existingPageCount; i++) {
        setUploadProgress(`Извлечение страницы ${i} из ${existingPageCount}...`);
        const page = await existingPdf.getPage(i);
        const originalViewport = page.getViewport({ scale: 1.0 });

        const maxDimension = 2000;
        const maxOriginal = Math.max(originalViewport.width, originalViewport.height);
        const scale = maxOriginal > maxDimension ? maxDimension / maxOriginal : 1.5;

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext("2d")!;
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        const base64 = await new Promise<string>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onload = () => {
                  resolve((reader.result as string).split(",")[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              } else {
                reject(new Error("Failed to convert page"));
              }
            },
            "image/jpeg",
            0.9,
          );
        });

        existingImages.push({ base64, width: viewport.width, height: viewport.height });
      }

      // Обрабатываем новые файлы
      const newImages: { base64: string; width: number; height: number }[] = [];

      for (let i = 0; i < addPagesFiles.length; i++) {
        const file = addPagesFiles[i];
        setUploadProgress(`Обработка нового файла ${i + 1} из ${addPagesFiles.length}...`);

        const { base64 } = await convertToJpeg(file);
        const compressedBase64 = await compressImage(base64);
        const dimensions = await getImageDimensions(compressedBase64);
        newImages.push({ base64: compressedBase64, ...dimensions });
      }

      // Объединяем все страницы
      const allImages = [...existingImages, ...newImages];

      setUploadProgress("Создание объединённого PDF...");
      const combinedPdfBlob = await createPdfFromImages(allImages);

      // Удаляем старый файл из хранилища
      const oldFilePath = extractFilePath(documentToAddPages.file_url);
      await supabase.storage.from("medical-documents").remove([oldFilePath]);

      // Загружаем новый PDF
      const newFileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(newFileName, combinedPdfBlob, {
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      const storedPath = newFileName;

      // Обновляем запись в БД
      const totalPages = existingPageCount + addPagesFiles.length;

      // Получаем существующие части из meta или создаём первую часть из текущего документа
      const existingMeta = (documentToAddPages.meta as DocumentMeta) || {};
      const existingParts: DocumentPart[] = existingMeta.parts || [
        {
          name: documentToAddPages.title?.replace(/_\d+_стр/, "").replace(/\.pdf$/, "") || "Документ",
          type_id: documentToAddPages.document_type_id || undefined,
          type_name: documentToAddPages.document_types?.name || undefined,
        },
      ];

      // Добавляем новые части
      const newParts: DocumentPart[] = addPagesFiles.map((file) => ({
        name: file.name.replace(/\.[^/.]+$/, "").substring(0, 30),
      }));

      const allParts = [...existingParts, ...newParts];

      // Формируем составное название через "+"
      const shortenName = (name: string) => (name.length > 20 ? name.substring(0, 20) + "…" : name);
      const combinedTitle = allParts.map((p) => shortenName(p.name)).join(" + ");

      const { error: updateError } = await supabase
        .from("medical_documents_v2")
        .update({
          file_url: storedPath,
          title: combinedTitle,
          is_classified: false,
          meta: JSON.parse(JSON.stringify({ parts: allParts })),
        })
        .eq("id", documentToAddPages.id);

      if (updateError) throw updateError;

      // Удаляем старые связи для повторного анализа
      await supabase.from("document_article_links").delete().eq("document_id", documentToAddPages.id);

      toast({
        title: "Страницы добавлены",
        description: `Теперь ${totalPages} страниц. Запускаем AI-анализ...`,
      });

      // Запускаем анализ на первой странице нового контента
      if (newImages.length > 0) {
        analyzeDocument(documentToAddPages.id, newImages[0].base64);
      }

      setDocumentToAddPages(null);
      setAddPagesFiles([]);
      loadDocuments();
    } catch (error: any) {
      console.error("Add pages error:", error);
      toast({
        title: "Ошибка добавления страниц",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingPages(false);
      setUploadProgress("");
    }
  };

  const copyExtractedText = async (text: string, docId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(docId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Текст скопирован" });
  };

  const downloadAsText = (doc: MedicalDocument) => {
    if (!doc.raw_text) return;
    const blob = new Blob([doc.raw_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title || "document"}_text.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDocument = async (doc: MedicalDocument) => {
    try {
      const signedUrl = await getSignedDocumentUrl(doc.file_url);
      if (!signedUrl) throw new Error("Не удалось получить доступ к файлу");
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = doc.file_url.toLowerCase().endsWith('.docx') ? '.docx' : doc.file_url.toLowerCase().endsWith('.pdf') ? '.pdf' : '.jpg';
      a.download = `${doc.title || "document"}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Ошибка скачивания",
        description: "Не удалось скачать документ",
        variant: "destructive",
      });
    }
  };

  const printDocument = async (doc: MedicalDocument) => {
    const signedUrl = await getSignedDocumentUrl(doc.file_url);
    if (!signedUrl) {
      toast({ title: "Ошибка", description: "Не удалось получить доступ к файлу", variant: "destructive" });
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        title: "Ошибка",
        description: "Разрешите всплывающие окна для печати",
        variant: "destructive",
      });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${doc.title || "Медицинский документ"}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; }
            .container { padding: 20px; }
            .header { margin-bottom: 20px; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
            .header h1 { font-size: 16px; margin: 0 0 5px; }
            .header p { color: #666; font-size: 12px; }
            .image-container { text-align: center; }
            img { max-width: 100%; height: auto; }
            .no-print { margin: 20px; text-align: center; }
            .no-print button { padding: 10px 30px; font-size: 16px; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 5px; margin-right: 10px; }
            .no-print button:hover { background: #2563eb; }
            .no-print .close-btn { background: #6b7280; }
            .no-print .close-btn:hover { background: #4b5563; }
            @media print {
              .no-print { display: none; }
              .container { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button onclick="window.print()">🖨️ Печать</button>
            <button class="close-btn" onclick="window.close()">Закрыть</button>
          </div>
          <div class="container">
            <div class="header">
              <h1>${doc.title || "Медицинский документ"}</h1>
              ${doc.document_date ? `<p>Дата документа: ${format(new Date(doc.document_date), "dd.MM.yyyy", { locale: ru })}</p>` : ""}
            </div>
            <div class="image-container">
              <img src="${signedUrl}" alt="${doc.title || "Документ"}" />
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const getCategoryColor = (category: string | null) => {
    if (!category) return "secondary";
    switch (category.toUpperCase()) {
      case "А":
        return "default";
      case "Б":
        return "secondary";
      case "В":
        return "destructive";
      case "Г":
        return "outline";
      case "Д":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const filteredDocuments = documents
    .filter((doc) => {
      if (filterType !== "all" && doc.document_type_id !== filterType) return false;
      if (searchQuery && doc.title && !doc.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      // Pin questionnaire documents at the top
      const aIsQuestionnaire = (a.meta as any)?.is_questionnaire === true;
      const bIsQuestionnaire = (b.meta as any)?.is_questionnaire === true;
      if (aIsQuestionnaire && !bIsQuestionnaire) return -1;
      if (!aIsQuestionnaire && bIsQuestionnaire) return 1;

      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortField) {
        case "uploaded_at":
          aVal = a.uploaded_at;
          bVal = b.uploaded_at;
          break;
        case "document_date":
          aVal = a.document_date;
          bVal = b.document_date;
          break;
        case "title":
          aVal = a.title;
          bVal = b.title;
          break;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const comparison = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12 pb-24 md:pb-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4">
            <SubscriptionBanner compact />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Медицинские документы</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                ИИ автоматически извлечёт текст и оценит категорию годности
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start sm:self-auto flex-shrink-0"
              onClick={() => navigate("/dashboard")}
            >
              Назад
            </Button>
          </div>

          {/* Drag & Drop Zone */}
          <Card className="mb-8">
            <CardContent className="p-6">
              {uploading ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="text-lg font-medium">
                    {enhancing ? "Улучшение качества документа..." : "Создание PDF..."}
                  </p>
                  {uploadProgress && <p className="text-sm text-muted-foreground">{uploadProgress}</p>}
                </div>
              ) : uploadMode === "handwritten" ? (
                <div className="py-6">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-medium mb-2">Загрузка рукописного документа</h3>
                    <p className="text-sm text-muted-foreground">
                      Загрузите фото документа и введите текст вручную для анализа
                    </p>
                  </div>

                  {/* Фото документов */}
                  <div className="mb-4">
                    <div className="relative border-2 border-dashed rounded-lg p-6 text-center transition-all border-muted-foreground/25 hover:border-primary/50">
                      <PenLine className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-base font-medium mb-1">
                        {handwrittenFiles.length === 0 ? "Выберите фото документа" : "Добавить ещё страницы"}
                      </p>
                      <p className="text-sm text-muted-foreground">Можно загрузить несколько страниц</p>
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => handleFileInput(e, "handwritten")}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>

                    {handwrittenFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium">Загруженные страницы ({handwrittenFiles.length}):</p>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {handwrittenFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 border rounded bg-muted/30"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs text-muted-foreground flex-shrink-0">{index + 1}.</span>
                                <span className="text-sm truncate">{file.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0"
                                onClick={() => removeHandwrittenFile(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Форма ручного ввода */}
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Вид документа</label>
                      <Input
                        placeholder="Например: Справка, Выписка, Заключение..."
                        value={handwrittenForm.documentType}
                        onChange={(e) => setHandwrittenForm((prev) => ({ ...prev, documentType: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Анализ / Обследование / Врач</label>
                      <Input
                        placeholder="Например: Рентген стоп, УЗИ, Консультация ортопеда..."
                        value={handwrittenForm.examination}
                        onChange={(e) => setHandwrittenForm((prev) => ({ ...prev, examination: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Заключение</label>
                      <Textarea
                        placeholder="Перепишите текст заключения из документа..."
                        value={handwrittenForm.conclusion}
                        onChange={(e) => setHandwrittenForm((prev) => ({ ...prev, conclusion: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Диагноз</label>
                      <Textarea
                        placeholder="Перепишите диагноз из документа..."
                        value={handwrittenForm.diagnosis}
                        onChange={(e) => setHandwrittenForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setUploadMode(null);
                        setHandwrittenFiles([]);
                        setHandwrittenForm({ documentType: "", examination: "", conclusion: "", diagnosis: "" });
                      }}
                    >
                      Отмена
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={handwrittenFiles.length === 0 || uploading}
                      onClick={uploadHandwrittenDocument}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Загрузка...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Загрузить и проанализировать
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : uploadMode ? (
                <div className="py-6">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-medium mb-2">
                      {uploadMode === "single"
                        ? "Загрузка одностраничных документов"
                        : "Загрузка многостраничного документа"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {uploadMode === "single"
                        ? "Каждый файл будет сохранён как отдельный документ"
                        : "Все выбранные файлы будут объединены в один PDF"}
                    </p>
                  </div>

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                      relative border-2 border-dashed rounded-lg p-8 text-center transition-all mb-4
                      ${
                        isDragOver
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-primary/50"
                      }
                    `}
                  >
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Upload className={`h-10 w-10 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <p className="text-base font-medium mb-1">Перетащите файлы сюда</p>
                    <p className="text-sm text-muted-foreground mb-3">или нажмите для выбора</p>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                      onChange={(e) => handleFileInput(e, uploadMode)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => setUploadMode(null)}>
                    Назад к выбору режима
                  </Button>
                </div>
              ) : (
                <div className="py-6">
                  <div className="text-center mb-6">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Загрузка документов</h3>
                    <p className="text-sm text-muted-foreground">ИИ конвертирует в PDF и проанализирует документ</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => setUploadMode("single")}
                    >
                      <CardContent className="p-6 text-center">
                        <File className="h-12 w-12 mx-auto mb-4 text-primary" />
                        <h4 className="font-medium mb-2">Одностраничный</h4>
                        <p className="text-sm text-muted-foreground">Справки, заключения — каждый файл отдельно</p>
                      </CardContent>
                    </Card>

                    <Card
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => setUploadMode("multi")}
                    >
                      <CardContent className="p-6 text-center">
                        <FileStack className="h-12 w-12 mx-auto mb-4 text-primary" />
                        <h4 className="font-medium mb-2">Многостраничный</h4>
                        <p className="text-sm text-muted-foreground">Медкарты — объединяются в один PDF</p>
                      </CardContent>
                    </Card>

                    <Card
                      className="cursor-pointer hover:border-primary/50 transition-colors border-dashed"
                      onClick={() => setUploadMode("handwritten")}
                    >
                      <CardContent className="p-6 text-center">
                        <PenLine className="h-12 w-12 mx-auto mb-4 text-primary" />
                        <h4 className="font-medium mb-2">Рукописный</h4>
                        <p className="text-sm text-muted-foreground">Ручной ввод текста для анализа</p>
                      </CardContent>
                    </Card>
                  </div>

                  <p className="text-xs text-center text-muted-foreground mt-4">
                    Поддерживаемые форматы: PDF, DOCX, JPEG, PNG, WebP
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Фильтры:</span>
                </div>

                <div className="flex-1 min-w-[200px] max-w-xs">
                  <Input
                    placeholder="Поиск по названию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9"
                  />
                </div>

                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="Тип документа" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    {documentTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(filterType !== "all" || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterType("all");
                      setSearchQuery("");
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Сбросить
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documents Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Загруженные документы ({filteredDocuments.length})
                </CardTitle>
                {selectedDocIds.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={() => setShowMultiDeleteConfirm(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить выбранные ({selectedDocIds.size})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {documents.length === 0
                    ? "Нет загруженных документов. Перетащите файлы в зону выше."
                    : "Документы не найдены по заданным фильтрам"}
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={toggleSelectAll}
                            title={
                              selectedDocIds.size === filteredDocuments.length ? "Снять выделение" : "Выделить все"
                            }
                          >
                            {selectedDocIds.size === filteredDocuments.length && filteredDocuments.length > 0 ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </Button>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted" onClick={() => toggleSort("title")}>
                          <div className="flex items-center">Название {getSortIcon("title")}</div>
                        </TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => toggleSort("document_date")}
                        >
                          <div className="flex items-center">Дата {getSortIcon("document_date")}</div>
                        </TableHead>
                        <TableHead>Категория</TableHead>
                        <TableHead>Шанс В</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => {
                        const isQuestionnaire = (doc.meta as any)?.is_questionnaire === true;
                        return (
                        <TableRow key={doc.id} className={`group ${selectedDocIds.has(doc.id) ? "bg-muted/50" : ""} ${isQuestionnaire ? "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-l-blue-500" : ""}`}>
                          <TableCell className="w-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleDocumentSelection(doc.id)}
                            >
                              {selectedDocIds.has(doc.id) ? (
                                <CheckSquare className="h-4 w-4 text-primary" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium w-[180px] max-w-[180px]">
                            <div className="whitespace-normal break-words text-sm leading-tight">
                              {isQuestionnaire && <Badge className="mb-1 text-[10px] bg-blue-500 hover:bg-blue-600 block w-fit">📋 Опросник</Badge>}
                              {doc.meta?.parts && doc.meta.parts.length > 1
                                ? doc.meta.parts.map((p) => p.name).join(" + ")
                                : doc.title || "Без названия"}
                            </div>
                            {doc.disease_articles_565 && (
                              <div className="text-xs text-primary mt-1">
                                Статья {doc.disease_articles_565.article_number}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[150px]">
                            {doc.meta?.parts && doc.meta.parts.length > 1 ? (
                              <div className="flex flex-col gap-1">
                                {doc.meta.parts.map(
                                  (part, idx) =>
                                    part.type_name && (
                                      <Badge key={idx} variant="secondary" className="text-xs w-fit">
                                        {part.type_name}
                                      </Badge>
                                    ),
                                )}
                                {doc.meta.parts.every((p) => !p.type_name) && (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </div>
                            ) : doc.document_types ? (
                              <Badge variant="secondary" className="text-xs">
                                {doc.document_types.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.document_date ? (
                              format(new Date(doc.document_date), "dd.MM.yyyy", { locale: ru })
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.ai_fitness_category ? (
                              <Badge variant={getCategoryColor(doc.ai_fitness_category)}>
                                {doc.ai_fitness_category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.ai_category_chance !== null ? (
                              <div className="flex items-center gap-2">
                                <Progress value={doc.ai_category_chance} className="w-16 h-2" />
                                <span className="text-sm font-medium">{doc.ai_category_chance}%</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {analyzingId === doc.id ? (
                              <Badge variant="outline" className="animate-pulse">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Анализ...
                              </Badge>
                            ) : doc.is_classified ? (
                              <Badge variant="default">
                                <Check className="h-3 w-3 mr-1" />
                                Обработан
                              </Badge>
                            ) : (
                              <Badge variant="outline">Не обработан</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details */}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => setSelectedDocument(doc)}
                                  >
                                    <Eye className="h-5 w-5" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden w-[95vw] sm:w-full">
                                  <DialogHeader>
                                    <DialogTitle className="break-words pr-8">{doc.title || "Документ"}</DialogTitle>
                                  </DialogHeader>
                                  <ScrollArea className="max-h-[calc(90vh-100px)]">
                                    <div className="space-y-4 sm:space-y-6 pr-4 overflow-hidden">
                                      {/* Document Viewer with PDF support */}
                                      <SignedDocumentViewer fileUrl={doc.file_url} />

                                      {/* AI Analysis Results */}
                                      {doc.is_classified && (
                                        <>
                                          {/* Category and Chance */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                            <Card>
                                              <CardHeader className="pb-2 px-3 sm:px-6">
                                                <CardTitle className="text-xs sm:text-sm">Категория годности</CardTitle>
                                              </CardHeader>
                                              <CardContent className="px-3 sm:px-6">
                                                <Badge
                                                  variant={getCategoryColor(doc.ai_fitness_category)}
                                                  className="text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2"
                                                >
                                                  Категория {doc.ai_fitness_category}
                                                </Badge>
                                              </CardContent>
                                            </Card>
                                            <Card>
                                              <CardHeader className="pb-2 px-3 sm:px-6">
                                                <CardTitle className="text-xs sm:text-sm">Шанс категории В</CardTitle>
                                              </CardHeader>
                                              <CardContent className="px-3 sm:px-6">
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                  <Progress
                                                    value={doc.ai_category_chance || 0}
                                                    className="flex-1 h-3 sm:h-4"
                                                  />
                                                  <span className="text-xl sm:text-2xl font-bold whitespace-nowrap">
                                                    {doc.ai_category_chance || 0}%
                                                  </span>
                                                </div>
                                              </CardContent>
                                            </Card>
                                          </div>

                                          {/* Explanation */}
                                          {doc.ai_explanation && (
                                            <Card>
                                              <CardHeader className="pb-2 px-3 sm:px-6">
                                                <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
                                                  <Brain className="h-4 w-4 flex-shrink-0" />
                                                  Обоснование ИИ
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent className="px-3 sm:px-6">
                                                <p className="text-xs sm:text-sm text-muted-foreground break-words whitespace-pre-wrap">
                                                  {doc.ai_explanation}
                                                </p>
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Recommendations */}
                                          {doc.ai_recommendations && doc.ai_recommendations.length > 0 && (
                                            <Card className="border-primary/50">
                                              <CardHeader className="pb-2 px-3 sm:px-6">
                                                <CardTitle className="text-xs sm:text-sm flex items-center gap-2 text-primary">
                                                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                                  Рекомендации ИИ
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent className="px-3 sm:px-6">
                                                <ul className="space-y-2">
                                                  {doc.ai_recommendations.map((rec, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                                                      <span className="text-primary font-bold flex-shrink-0">
                                                        {idx + 1}.
                                                      </span>
                                                      <span className="break-words">{rec}</span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Extracted Text */}
                                          {doc.raw_text && (
                                            <Card>
                                              <CardHeader className="pb-2 px-3 sm:px-6">
                                                <CardTitle className="text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                  <span>Извлечённый текст</span>
                                                  <div className="flex gap-1 sm:gap-2">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 px-2 sm:px-3 text-xs"
                                                      onClick={() => copyExtractedText(doc.raw_text!, doc.id)}
                                                    >
                                                      {copiedId === doc.id ? (
                                                        <Check className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                                      ) : (
                                                        <Copy className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                                      )}
                                                      <span className="hidden sm:inline">Копировать</span>
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 px-2 sm:px-3 text-xs"
                                                      onClick={() => downloadAsText(doc)}
                                                    >
                                                      <Download className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                                      <span className="hidden sm:inline">Скачать .txt</span>
                                                    </Button>
                                                  </div>
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent className="px-3 sm:px-6">
                                                <Textarea
                                                  value={doc.raw_text}
                                                  readOnly
                                                  className="min-h-[150px] sm:min-h-[200px] text-xs sm:text-sm font-mono"
                                                />
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Link to Medical History */}
                                          {doc.linked_article_id && (
                                            <Button
                                              variant="outline"
                                              className="w-full text-xs sm:text-sm"
                                              onClick={() =>
                                                navigate(
                                                  `/medical-history?article=${doc.disease_articles_565?.article_number}`,
                                                )
                                              }
                                            >
                                              <ExternalLink className="h-4 w-4 mr-2 flex-shrink-0" />
                                              <span className="truncate">
                                                Открыть в Истории болезни (Статья{" "}
                                                {doc.disease_articles_565?.article_number})
                                              </span>
                                            </Button>
                                          )}
                                        </>
                                      )}

                                      {/* Actions */}
                                      <div className="flex gap-2 flex-wrap">
                                        <Button
                                          variant="outline"
                                          className="flex-1"
                                          onClick={() => downloadDocument(doc)}
                                        >
                                          <Download className="h-4 w-4 mr-2" />
                                          Скачать
                                        </Button>
                                        <Button variant="outline" className="flex-1" onClick={() => printDocument(doc)}>
                                          <Printer className="h-4 w-4 mr-2" />
                                          Печать
                                        </Button>
                                        {!doc.is_classified && (
                                          <Button
                                            className="flex-1"
                                            onClick={() => analyzeDocument(doc.id)}
                                            disabled={analyzingId === doc.id}
                                          >
                                            {analyzingId === doc.id ? (
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            ) : (
                                              <Brain className="h-4 w-4 mr-2" />
                                            )}
                                            Анализировать ИИ
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </ScrollArea>
                                </DialogContent>
                              </Dialog>

                              {/* Add Pages */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setDocumentToAddPages(doc)}
                                title="Добавить страницы"
                              >
                                <Plus className="h-5 w-5" />
                              </Button>

                              {/* Re-analyze */}
                              {doc.is_classified && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => analyzeDocument(doc.id)}
                                  disabled={analyzingId === doc.id}
                                  title="Повторить анализ"
                                >
                                  <Brain className="h-5 w-5" />
                                </Button>
                              )}

                              {/* Download */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => downloadDocument(doc)}
                                title="Скачать"
                              >
                                <Download className="h-5 w-5" />
                              </Button>

                              {/* Print */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => printDocument(doc)}
                                title="Печать"
                              >
                                <Printer className="h-5 w-5" />
                              </Button>

                              {/* Delete */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setDocumentToDelete(doc)}
                              >
                                <Trash2 className="h-5 w-5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!documentToDelete} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить документ "{documentToDelete?.title || "Без названия"}"? Это действие нельзя
              отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-Delete Confirmation Dialog */}
      <AlertDialog open={showMultiDeleteConfirm} onOpenChange={setShowMultiDeleteConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {selectedDocIds.size} документов?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить выбранные документы? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMultiple}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить все
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Pages Dialog */}
      <Dialog
        open={!!documentToAddPages}
        onOpenChange={(open) => {
          if (!open) {
            setDocumentToAddPages(null);
            setAddPagesFiles([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить страницы к документу</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{documentToAddPages?.title || "Документ"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Новые страницы будут добавлены в конец документа с повторным AI-анализом
              </p>
            </div>

            {addingPages ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">{uploadProgress}</p>
              </div>
            ) : (
              <>
                <div className="relative border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <FileStack className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">
                    {addPagesFiles.length === 0 ? "Выберите файлы" : "Добавить ещё"}
                  </p>
                  <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, WebP</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleAddPagesFiles}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                {addPagesFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Файлы для добавления ({addPagesFiles.length}):</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {addPagesFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground flex-shrink-0">{index + 1}.</span>
                            <span className="text-sm truncate">{file.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 flex-shrink-0"
                            onClick={() => setAddPagesFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDocumentToAddPages(null);
                      setAddPagesFiles([]);
                    }}
                  >
                    Отмена
                  </Button>
                  <Button className="flex-1" disabled={addPagesFiles.length === 0} onClick={addPagesToDocument}>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить ({addPagesFiles.length})
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
