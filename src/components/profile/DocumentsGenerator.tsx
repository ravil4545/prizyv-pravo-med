import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DocumentsGeneratorProps {
  profile: any;
  userId: string;
}

const DocumentsGenerator = ({ profile, userId }: DocumentsGeneratorProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const documents = [
    {
      id: "priobschenie",
      title: "Заявление на приобщение документов",
      description: "Заявление о приобщении медицинских документов к делу призывника"
    },
    {
      id: "vypiska",
      title: "Заявление на получение выписки",
      description: "Заявление на получение выписки из протокола призывной комиссии"
    },
    {
      id: "obzhalovanie",
      title: "Обжалование в вышестоящий военкомат",
      description: "Жалоба на решение призывной комиссии в вышестоящий военкомат"
    },
    {
      id: "prokuratura",
      title: "Жалоба в прокуратуру",
      description: "Жалоба в прокуратуру на действия военного комиссариата"
    },
    {
      id: "isk_sud",
      title: "Исковое заявление в суд",
      description: "Исковое заявление об оспаривании решения призывной комиссии"
    },
    {
      id: "apellyaciya",
      title: "Апелляционная жалоба",
      description: "Жалоба в апелляционную инстанцию на решение суда первой инстанции"
    },
  ];

  const handleGenerateDocument = async (docType: string, format: "docx" | "xlsx") => {
    // Предупреждение, если не все данные заполнены
    if (!profile?.full_name || !profile?.passport_series) {
      toast({
        title: "Данные не полностью заполнены",
        description: "Некоторые поля в документе могут быть пустыми. Заполните профиль для лучшего результата.",
        variant: "default",
      });
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-document', {
        body: {
          userId,
          docType,
          format,
        },
      });

      if (error) throw error;

      // Создаем blob и скачиваем
      const mimeType = format === 'docx' 
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      
      const blob = new Blob([data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docType}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Документ создан",
        description: "Файл успешно скачан. Проверьте папку загрузок.",
      });
    } catch (error) {
      console.error("Error generating document:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сгенерировать документ",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Генерация документов</CardTitle>
          <CardDescription>
            Автоматическое заполнение шаблонов на основе ваших данных
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="border-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {doc.title}
                  </CardTitle>
                  <CardDescription>{doc.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateDocument(doc.id, "docx")}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    DOCX
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateDocument(doc.id, "xlsx")}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    XLSX
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">Примеры заполнения шаблонов:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Все поля автоматически заполняются данными из вашего профиля</li>
              <li>ФИО, паспортные данные, адреса подставляются в нужные места</li>
              <li>Названия военкоматов, судов, прокуратуры берутся из раздела "Военкомат"</li>
              <li>Диагнозы и категории годности указываются из раздела "Диагнозы"</li>
              <li>После скачивания проверьте и отредактируйте документ при необходимости</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentsGenerator;
