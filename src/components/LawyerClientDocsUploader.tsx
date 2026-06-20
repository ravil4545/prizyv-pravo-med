import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Brain, Trash2, Eye, AlertCircle, Loader2,
} from "lucide-react";
import { getSignedDocumentUrl, extractFilePath } from "@/lib/storage";
import { extractFnError } from "@/lib/edgeError";
import DocumentUploadWizard, { type DocumentUploadResult } from "@/components/DocumentUploadWizard";

interface LawyerClientDocsUploaderProps {
  lawyerClientId: string;
  lawyerId: string;
  /** Если задан — функция-колбэк, которая открывает preview-диалог родителя */
  onPreview?: (doc: { title: string; file_url: string }) => void;
}

interface LawyerClientDoc {
  id: string;
  title: string | null;
  document_date: string | null;
  file_url: string;
  ai_fitness_category: string | null;
  ai_explanation: string | null;
  ai_recommendations: string[] | null;
  created_at: string;
}

/**
 * Загрузка медицинских документов СО СТОРОНЫ ЮРИСТА (для клиентов CRM без аккаунта).
 * Файлы кладём в storage `medical-documents/lawyer-uploads/{lawyer_id}/{client_id}/...`,
 * метаданные — в таблицу lawyer_client_med_docs.
 *
 * ИИ-анализ запускается по кнопке (использует edge-функцию analyze-medical-document
 * с режимом «lawyer-doc»; если функция ещё не поддерживает — выводим тост).
 */
const LawyerClientDocsUploader = ({
  lawyerClientId, lawyerId, onPreview,
}: LawyerClientDocsUploaderProps) => {
  const { toast } = useToast();
  const [docs, setDocs] = useState<LawyerClientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocs();
  }, [lawyerClientId]);

  const loadDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lawyer_client_med_docs" as any)
      .select("id,title,document_date,file_url,ai_fitness_category,ai_explanation,ai_recommendations,created_at")
      .eq("lawyer_client_id", lawyerClientId)
      .order("created_at", { ascending: false });
    if (error) {
      // Таблица может быть ещё не создана в проде — мягкий фолбэк
      console.warn("lawyer_client_med_docs не найдена, миграцию надо применить", error);
      setDocs([]);
    } else {
      setDocs((data as unknown as LawyerClientDoc[]) || []);
    }
    setLoading(false);
  };

  // Загрузка из мастера: к нам приходит готовый PDF-blob со всеми склеенными
  // страницами одного логического документа. Сохраняем как один файл в
  // medical-documents/lawyer-uploads/<lawyer>/<client>/<ts>.pdf и одну запись
  // в lawyer_client_med_docs.
  const handleWizardUpload = async (result: DocumentUploadResult) => {
    const safeTitle = result.title.replace(/[^\w.\-а-яА-ЯёЁ ]/g, "_").slice(0, 80) || "Документ";
    const path = `lawyer-uploads/${lawyerId}/${lawyerClientId}/${Date.now()}_${safeTitle}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("medical-documents")
      .upload(path, result.blob, { contentType: "application/pdf" });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
      .from("lawyer_client_med_docs" as any)
      .insert({
        lawyer_client_id: lawyerClientId,
        lawyer_id: lawyerId,
        title: result.title,
        file_url: path,
        document_date: new Date().toISOString().slice(0, 10),
      });
    if (insertError) throw insertError;

    toast({ title: `«${result.title}» загружен`, description: `${result.pages} стр.` });
    loadDocs();
  };

  const deleteDoc = async (doc: LawyerClientDoc) => {
    if (!confirm(`Удалить документ «${doc.title || "без названия"}»?`)) return;
    try {
      await supabase.storage.from("medical-documents").remove([extractFilePath(doc.file_url)]);
    } catch (e) {
      // не критично — файл может быть уже удалён
    }
    const { error } = await supabase
      .from("lawyer_client_med_docs" as any)
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" });
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast({ title: "Документ удалён" });
  };

  // Рендер PDF в JPEG-страницы (vision-функция принимает изображения, не PDF).
  // Переиспользуем тот же pdfjs, что и PdfViewer (worker /pdf.worker.min.mjs).
  const renderPdfToImages = async (signedUrl: string, maxPages = 6): Promise<string[]> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const buf = await (await fetch(signedUrl)).arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    try {
      const out: string[] = [];
      const n = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= n; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Не удалось подготовить холст для рендера PDF");
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        out.push(canvas.toDataURL("image/jpeg", 0.8));
      }
      return out;
    } finally {
      try { await pdf.destroy(); } catch { /* освобождение ресурсов pdfjs */ }
    }
  };

  const fileToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  // ИИ-анализ документа, загруженного юристом: готовим страницы → отправляем
  // в analyze-medical-document в режиме lawyer (пишет результат в
  // lawyer_client_med_docs). Требует деплоя обновлённой edge-функции.
  const runAi = async (doc: LawyerClientDoc) => {
    setAnalyzingId(doc.id);
    try {
      const signedUrl = await getSignedDocumentUrl(doc.file_url);
      if (!signedUrl) throw new Error("Не удалось получить файл документа");

      const isPdf = (doc.file_url || "").toLowerCase().endsWith(".pdf");
      let images: string[];
      if (isPdf) {
        images = await renderPdfToImages(signedUrl);
      } else {
        const blob = await (await fetch(signedUrl)).blob();
        images = [await fileToDataUrl(blob)];
      }
      if (!images.length) throw new Error("Не удалось подготовить страницы документа");

      const { error } = await supabase.functions.invoke("analyze-medical-document", {
        body: { images, lawyerDocId: doc.id },
      });
      if (error) {
        toast({ title: "Ошибка анализа", description: await extractFnError(error), variant: "destructive" });
        return;
      }
      toast({ title: "Анализ завершён", description: "Категория и рекомендации сохранены в документе." });
      loadDocs();
    } catch (e: any) {
      toast({ title: "Не удалось проанализировать", description: e?.message || "Попробуйте позже", variant: "destructive" });
    } finally {
      setAnalyzingId(null);
    }
  };

  const openPreview = async (doc: LawyerClientDoc) => {
    if (onPreview) {
      onPreview({ title: doc.title || "Документ", file_url: doc.file_url });
      return;
    }
    const url = await getSignedDocumentUrl(doc.file_url);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      <DocumentUploadWizard
        onUpload={handleWizardUpload}
        hint="Каждый слот — отдельный документ клиента (выписка, заключение, справка). Внутри одного слота можно собрать все страницы документа: загрузить PDF, фото из галереи или сфотографировать камерой. После заполнения 3 слотов добавится ещё."
      />

      {loading ? (
        Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Документов пока нет</p>
            <p className="text-xs text-muted-foreground mt-1">
              Загрузите справки, выписки и заключения врачей — будем хранить в карточке клиента
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.title || "Документ без названия"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.document_date || new Date(doc.created_at).toLocaleDateString("ru-RU")}
                    </p>
                    {doc.ai_fitness_category && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {doc.ai_fitness_category}
                      </Badge>
                    )}
                    {doc.ai_explanation && (
                      <p className="text-xs text-muted-foreground mt-1">{doc.ai_explanation}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openPreview(doc)} className="gap-1">
                      <Eye className="h-3.5 w-3.5" /> Открыть
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => runAi(doc)} disabled={analyzingId === doc.id} className="gap-1">
                      {analyzingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />} ИИ
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteDoc(doc)} className="gap-1 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Нажмите «ИИ» у документа — система распознает текст и сопоставит с Расписанием болезней:
          появится предполагаемая категория годности и обоснование.
        </span>
      </div>
    </div>
  );
};

export default LawyerClientDocsUploader;
