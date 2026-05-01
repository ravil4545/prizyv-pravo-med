import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Archive, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";

interface DossierExportButtonProps {
  userId: string;
  profile?: { full_name?: string; city?: string; phone?: string } | null;
}

export default function DossierExportButton({ userId, profile }: DossierExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setLoading(true);
    try {
      // Load documents
      const { data: docs } = await supabase
        .from("medical_documents_v2")
        .select("id, file_name, file_url, upload_date, ai_fitness_category, ai_explanation, ai_recommendations")
        .eq("user_id", userId)
        .order("upload_date", { ascending: false });

      if (!docs || docs.length === 0) {
        toast({ title: "Нет документов", description: "Загрузите медицинские документы для экспорта досье", variant: "destructive" });
        return;
      }

      // Generate PDF summary
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Медицинское досье", pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      if (profile?.full_name) {
        doc.text(`Пациент: ${profile.full_name}`, 14, y);
        y += 7;
      }
      doc.text(`Дата формирования: ${new Date().toLocaleDateString("ru-RU")}`, 14, y);
      y += 7;
      doc.text(`Всего документов: ${docs.length}`, 14, y);
      y += 12;

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Список документов:", 14, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      for (const d of docs) {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`• ${d.file_name || "Без названия"}`, 14, y);
        y += 6;
        doc.setFont("helvetica", "normal");

        if (d.upload_date) {
          doc.text(`  Дата: ${new Date(d.upload_date).toLocaleDateString("ru-RU")}`, 14, y);
          y += 5;
        }
        if (d.ai_fitness_category) {
          doc.text(`  Категория годности: ${d.ai_fitness_category}`, 14, y);
          y += 5;
        }
        if (d.ai_explanation) {
          const lines = doc.splitTextToSize(`  Анализ: ${d.ai_explanation}`, pageWidth - 28);
          for (const line of lines.slice(0, 3)) {
            doc.text(line, 14, y);
            y += 5;
          }
        }
        y += 3;
      }

      // Download PDF
      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `Досье_${profile?.full_name || "пациент"}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(pdfUrl);

      toast({
        title: "Досье экспортировано",
        description: `PDF-сводка из ${docs.length} документов сохранена`,
      });
    } catch (error) {
      console.error("Dossier export error:", error);
      toast({ title: "Ошибка экспорта", description: "Не удалось сформировать досье", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="gap-2"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
      {loading ? "Формируем..." : "Экспорт досье PDF"}
    </Button>
  );
}
