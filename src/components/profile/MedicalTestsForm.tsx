import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Download, Pencil, FileText } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface TestTemplate {
  id: string;
  test_name: string;
  category: string | null;
}

interface UserTestResult {
  id: string;
  template_id: string;
  test_date: string | null;
  file_path: string | null;
  ai_summary: string | null;
  user_notes: string | null;
}

interface TestWithResult extends TestTemplate {
  result?: UserTestResult;
}

interface MedicalTestsFormProps {
  userId: string;
}

const MedicalTestsForm = ({ userId }: MedicalTestsFormProps) => {
  const [testsWithResults, setTestsWithResults] = useState<TestWithResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestWithResult | null>(null);
  const [formData, setFormData] = useState({
    test_date: "",
    ai_summary: "",
    user_notes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    loadTestsAndResults();
  }, [userId]);

  const loadTestsAndResults = async () => {
    try {
      // Load all test templates
      const { data: templates, error: templatesError } = await supabase
        .from("test_templates")
        .select("*")
        .order("category", { ascending: true });

      if (templatesError) throw templatesError;

      // Load user's test results
      const { data: results, error: resultsError } = await supabase
        .from("user_test_results")
        .select("*")
        .eq("user_id", userId);

      if (resultsError) throw resultsError;

      // Combine templates with results
      const combined: TestWithResult[] = (templates || []).map((template) => ({
        ...template,
        result: (results || []).find((r) => r.template_id === template.id),
      }));

      setTestsWithResults(combined);
    } catch (error) {
      console.error("Error loading tests:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить анализы",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest) return;

    setUploading(true);
    try {
      let filePath = selectedTest.result?.file_path;

      // Upload file if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${userId}/${selectedTest.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("test-results")
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      // Save or update result
      if (selectedTest.result) {
        const { error } = await supabase
          .from("user_test_results")
          .update({
            test_date: formData.test_date || null,
            file_path: filePath,
            ai_summary: formData.ai_summary || null,
            user_notes: formData.user_notes || null,
          })
          .eq("id", selectedTest.result.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_test_results").insert([
          {
            user_id: userId,
            template_id: selectedTest.id,
            test_date: formData.test_date || null,
            file_path: filePath,
            ai_summary: formData.ai_summary || null,
            user_notes: formData.user_notes || null,
          },
        ]);

        if (error) throw error;
      }

      toast({
        title: "Успешно",
        description: "Результат сохранен",
      });

      setIsDialogOpen(false);
      resetForm();
      loadTestsAndResults();
    } catch (error) {
      console.error("Error saving test result:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить результат",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (filePath: string, testName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("test-results")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${testName}.${filePath.split(".").pop()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading file:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось скачать файл",
        variant: "destructive",
      });
    }
  };

  const handleEditResult = (test: TestWithResult) => {
    setSelectedTest(test);
    setFormData({
      test_date: test.result?.test_date || "",
      ai_summary: test.result?.ai_summary || "",
      user_notes: test.result?.user_notes || "",
    });
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      test_date: "",
      ai_summary: "",
      user_notes: "",
    });
    setSelectedTest(null);
    setSelectedFile(null);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  // Filter tests based on search and category
  const filteredTests = testsWithResults.filter((test) => {
    const matchesSearch = test.test_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || test.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(
    new Set(testsWithResults.map((t) => t.category).filter(Boolean))
  ).sort() as string[];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="w-full sm:w-auto">
          <h2 className="text-xl font-semibold mb-2">Анализы и обследования</h2>
          <p className="text-sm text-muted-foreground">
            Нажмите на любой анализ, чтобы загрузить результаты
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Поиск анализа..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">Все категории</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[30%]">Название анализа</TableHead>
                <TableHead className="w-[12%]">Дата сдачи</TableHead>
                <TableHead className="w-[25%]">Резюме от AI</TableHead>
                <TableHead className="w-[25%]">Ваши заметки</TableHead>
                <TableHead className="w-[8%] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTests.map((test) => (
                <TableRow
                  key={test.id}
                  className={test.result ? "bg-muted/30" : ""}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {test.result?.file_path && (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                      {test.test_name}
                    </div>
                    {test.category && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {test.category}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {test.result?.test_date
                      ? format(new Date(test.result.test_date), "dd.MM.yyyy", {
                          locale: ru,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {test.result?.ai_summary || (
                      <span className="text-muted-foreground italic">
                        Не заполнено
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {test.result?.user_notes || (
                      <span className="text-muted-foreground italic">
                        Нет заметок
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditResult(test)}
                        title="Загрузить результаты"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      {test.result?.file_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDownload(test.result!.file_path!, test.test_name)
                          }
                          title="Скачать файл"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTest?.test_name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Файл результатов</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept="image/*,.pdf"
              />
              {selectedTest?.result?.file_path && !selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Файл уже загружен. Выберите новый файл, чтобы заменить.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="test_date">Дата сдачи</Label>
              <Input
                id="test_date"
                type="date"
                value={formData.test_date}
                onChange={(e) =>
                  setFormData({ ...formData, test_date: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai_summary">Резюме от AI</Label>
              <Textarea
                id="ai_summary"
                value={formData.ai_summary}
                onChange={(e) =>
                  setFormData({ ...formData, ai_summary: e.target.value })
                }
                placeholder="Краткое резюме результатов анализа"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_notes">Ваши заметки</Label>
              <Textarea
                id="user_notes"
                value={formData.user_notes}
                onChange={(e) =>
                  setFormData({ ...formData, user_notes: e.target.value })
                }
                placeholder="Личные заметки и наблюдения"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
                disabled={uploading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalTestsForm;
