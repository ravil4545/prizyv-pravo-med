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

interface LawyerDossierExportButtonProps {
  /** Идентификатор записи lawyer_clients */
  lawyerClientId: string;
  /** Заполненные данные клиента из карточки юриста */
  client: {
    client_name?: string | null;
    client_phone?: string | null;
    client_email?: string | null;
    client_birth_year?: number | null;
    client_user_id?: string | null;
    diagnosis?: string | null;
    expected_category?: string | null;
    city?: string | null;
  };
  /** Есть ли у юриста live-доступ к документам клиента (для medical_documents_v2) */
  hasDocAccess?: boolean;
  /** ФИО юриста — попадёт в шапку досье как «сформировано юристом ...» */
  lawyerName?: string | null;
  /** Опциональные кастомные стили кнопки */
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
}

/**
 * Кнопка экспорта медицинского досье клиента — для юриста.
 *
 * Источник документов:
 *   • если клиент привязан (client_user_id) и есть доступ — medical_documents_v2;
 *   • иначе — lawyer_client_med_docs (сканы, которые юрист загрузил сам).
 *
 * Если документов нет ни там ни там — показываем понятную ошибку.
 */
export default function LawyerDossierExportButton({
  lawyerClientId,
  client,
  hasDocAccess = false,
  lawyerName,
  variant = "outline",
  size = "sm",
}: LawyerDossierExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "docx" | null>(null);
  const { toast } = useToast();

  const loadDocuments = async (): Promise<DossierDoc[]> => {
    // 1) Привязанный клиент + есть открытый доступ → используем
    //    medical_documents_v2 (с тем самым AI-анализом, что видит клиент).
    if (client.client_user_id && hasDocAccess) {
      const { data, error } = await supabase
        .from("medical_documents_v2")
        .select("id, title, document_date, ai_fitness_category, ai_explanation, ai_recommendations")
        .eq("user_id", client.client_user_id)
        .order("document_date", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        return (data as any[]).map((d) => ({
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
      }
    }

    // 2) Иначе — документы, которые юрист загрузил в карточку сам.
    const { data, error } = await supabase
      .from("lawyer_client_med_docs")
      .select("id, title, document_date, ai_fitness_category, ai_explanation, ai_recommendations")
      .eq("lawyer_client_id", lawyerClientId)
      .order("document_date", { ascending: false });
    if (error) throw error;
    return (data || []).map((d: any) => ({
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
  };

  const buildData = async (): Promise<DossierData | null> => {
    try {
      const documents = await loadDocuments();
      if (documents.length === 0) {
        toast({
          title: "Нет документов",
          description: client.client_user_id && !hasDocAccess
            ? "Клиент пока не открыл доступ к документам, а сканы в карточке не загружены."
            : "Загрузите сканы медкарт во вкладке «Документы» — после этого досье будет сформировано.",
          variant: "destructive",
        });
        return null;
      }
      return {
        fullName: client.client_name || null,
        birthYear: client.client_birth_year || null,
        city: client.city || null,
        phone: client.client_phone || null,
        email: client.client_email || null,
        diagnosis: client.diagnosis || null,
        expectedCategory: client.expected_category || null,
        documents,
        generatedBy: "lawyer",
        lawyerName: lawyerName || null,
      };
    } catch (e) {
      toast({
        title: "Не удалось загрузить документы",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
      return null;
    }
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
    } finally {
      setLoading(null);
    }
  };

  const isBusy = loading !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isBusy} className="gap-2">
          {isBusy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Archive className="h-4 w-4" />}
          {isBusy ? "Формируем..." : "Досье клиента"}
          {!isBusy && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">Скачать как</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isBusy}>
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          <div className="flex flex-col items-start">
            <span>PDF</span>
            <span className="text-[10px] text-muted-foreground">для печати, суда, обмена</span>
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
