import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Archive, Loader2, FileText, FileType, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  generateDossierPDF,
  generateDossierDOCX,
  downloadDossier,
  type DossierDoc,
  type DossierData,
} from "@/lib/dossier";

interface DossierExportButtonProps {
  userId: string;
  profile?: {
    full_name?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    birth_year?: number | null;
    diagnosis?: string | null;
    expected_category?: string | null;
  } | null;
  /** Опционально: если кнопку нажимает юрист — добавим его подпись в шапку */
  generatedBy?: "client" | "lawyer";
  lawyerName?: string | null;
}

export default function DossierExportButton({
  userId, profile, generatedBy = "client", lawyerName,
}: DossierExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "docx" | null>(null);
  const { toast } = useToast();

  const buildData = async (): Promise<DossierData | null> => {
    const { data: docs, error } = await supabase
      .from("medical_documents_v2")
      .select("id, title, document_date, ai_fitness_category, ai_explanation, ai_recommendations")
      .eq("user_id", userId)
      .order("document_date", { ascending: false });

    if (error) {
      toast({ title: "Не удалось загрузить документы", description: error.message, variant: "destructive" });
      return null;
    }
    if (!docs || docs.length === 0) {
      toast({
        title: "Нет документов",
        description: "Загрузите медицинские документы для экспорта досье",
        variant: "destructive",
      });
      return null;
    }

    const dossierDocs: DossierDoc[] = (docs as any[]).map((d) => ({
      title: d.title || "Без названия",
      document_date: d.document_date,
      ai_fitness_category: d.ai_fitness_category,
      ai_explanation: d.ai_explanation,
      ai_recommendations: Array.isArray(d.ai_recommendations)
        ? d.ai_recommendations
        : d.ai_recommendations
          ? [String(d.ai_recommendations)]
          : null,
    }));

    return {
      fullName: profile?.full_name || null,
      birthYear: profile?.birth_year || null,
      city: profile?.city || null,
      phone: profile?.phone || null,
      email: profile?.email || null,
      diagnosis: profile?.diagnosis || null,
      expectedCategory: profile?.expected_category || null,
      documents: dossierDocs,
      generatedBy,
      lawyerName,
    };
  };

  const handleExport = async (format: "pdf" | "docx") => {
    setLoading(format);
    try {
      const data = await buildData();
      if (!data) return;

      let blob: Blob;
      try {
        blob = format === "pdf"
          ? await generateDossierPDF(data)
          : await generateDossierDOCX(data);
      } catch (e) {
        // Часто бьётся PDF из-за того, что не удалось загрузить кириллический
        // шрифт с CDN. Предложим клиенту DOCX-альтернативу.
        console.error("Dossier generation error:", e);
        if (format === "pdf") {
          toast({
            title: "Не удалось сделать PDF",
            description: "Не загрузился кириллический шрифт. Попробуйте DOCX — он работает без интернета.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Ошибка экспорта DOCX",
            description: e instanceof Error ? e.message : "Неизвестная ошибка",
            variant: "destructive",
          });
        }
        return;
      }

      downloadDossier(blob, data, format);
      toast({
        title: "Досье готово",
        description: `${format.toUpperCase()}-файл из ${data.documents.length} документов сохранён`,
      });
    } catch (error) {
      console.error("Dossier export error:", error);
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось сформировать досье",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const isBusy = loading !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isBusy} className="gap-2">
          {isBusy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Archive className="h-4 w-4" />}
          {isBusy ? "Формируем..." : "Экспорт досье"}
          {!isBusy && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Выберите формат</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isBusy}>
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          <div className="flex flex-col items-start">
            <span>PDF</span>
            <span className="text-[10px] text-muted-foreground">для печати и пересылки</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("docx")} disabled={isBusy}>
          <FileType className="h-4 w-4 mr-2 text-blue-500" />
          <div className="flex flex-col items-start">
            <span>DOCX (Word)</span>
            <span className="text-[10px] text-muted-foreground">для правок и подписи</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
