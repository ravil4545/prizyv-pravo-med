import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";

export default function AdminArticlesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!data) { navigate("/dashboard"); return; }
    setIsAdmin(true);
    setLoading(false);
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".docx")) {
      toast.error("Поддерживаются только файлы .docx");
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      // Extract text from DOCX using mammoth
      const arrayBuffer = await file.arrayBuffer();
      const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });

      if (!rawText || rawText.length < 100) {
        toast.error("Не удалось извлечь текст из документа");
        setImporting(false);
        return;
      }

      toast.info(`Извлечено ${rawText.length} символов. Отправка на обработку...`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/import-articles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ rawText }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка импорта");
      }

      setResult(data);
      toast.success(`Обновлено ${data.updated} из ${data.totalParsed} статей`);
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error(error.message || "Ошибка при импорте");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }, []);

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
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Назад
          </Button>
          <h1 className="text-2xl font-bold">Управление статьями расписания болезней</h1>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Импорт текстов статей из DOCX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Загрузите файл Постановления Правительства РФ №565 в формате DOCX. 
              Система автоматически извлечёт тексты статей и обновит их в базе данных.
              Текст не будет изменён — он сохранится как есть из документа.
            </p>

            <div className="flex items-center gap-3">
              <Button disabled={importing} asChild>
                <label className="cursor-pointer">
                  {importing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {importing ? "Обработка..." : "Загрузить DOCX"}
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={importing}
                  />
                </label>
              </Button>
            </div>

            {result && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Результат импорта
                </div>
                <div className="text-sm space-y-1">
                  <p>Найдено статей: <strong>{result.totalParsed}</strong></p>
                  <p>Обновлено в БД: <strong>{result.updated}</strong></p>
                  {result.notFoundInDb?.length > 0 && (
                    <p className="text-amber-600">
                      Не найдены в БД: {result.notFoundInDb.join(", ")}
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Найденные номера статей
                    </summary>
                    <p className="text-xs mt-1">{result.articleNumbers?.join(", ")}</p>
                  </details>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
