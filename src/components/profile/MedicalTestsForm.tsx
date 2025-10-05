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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface MedicalTest {
  id: string;
  test_name: string;
  test_date: string | null;
  ai_summary: string | null;
  user_notes: string | null;
}

interface MedicalTestsFormProps {
  userId: string;
}

const COMMON_TESTS = [
  "Клинический анализ крови",
  "Клинический анализ мочи",
  "Биохимия крови",
  "Коагулограмма",
  "ТТГ (тиреотропный гормон)",
  "Т4 свободный",
  "Эхокардиография",
  "УЗИ щитовидной железы",
  "Рентген грудной клетки",
  "ЭКГ",
];

const MedicalTestsForm = ({ userId }: MedicalTestsFormProps) => {
  const [tests, setTests] = useState<MedicalTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<MedicalTest | null>(null);
  const [formData, setFormData] = useState({
    test_name: "",
    test_date: "",
    ai_summary: "",
    user_notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTests();
  }, [userId]);

  const loadTests = async () => {
    try {
      const { data, error } = await supabase
        .from("medical_tests")
        .select("*")
        .eq("user_id", userId)
        .order("test_date", { ascending: false, nullsFirst: false });

      if (error) throw error;
      setTests(data || []);
    } catch (error) {
      console.error("Error loading medical tests:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить анализы",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingTest) {
        const { error } = await supabase
          .from("medical_tests")
          .update({
            test_name: formData.test_name,
            test_date: formData.test_date || null,
            ai_summary: formData.ai_summary || null,
            user_notes: formData.user_notes || null,
          })
          .eq("id", editingTest.id);

        if (error) throw error;
        toast({
          title: "Успешно",
          description: "Анализ обновлен",
        });
      } else {
        const { error } = await supabase.from("medical_tests").insert([
          {
            user_id: userId,
            test_name: formData.test_name,
            test_date: formData.test_date || null,
            ai_summary: formData.ai_summary || null,
            user_notes: formData.user_notes || null,
          },
        ]);

        if (error) throw error;
        toast({
          title: "Успешно",
          description: "Анализ добавлен",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      loadTests();
    } catch (error) {
      console.error("Error saving medical test:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить анализ",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот анализ?")) return;

    try {
      const { error } = await supabase
        .from("medical_tests")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({
        title: "Успешно",
        description: "Анализ удален",
      });
      loadTests();
    } catch (error) {
      console.error("Error deleting medical test:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить анализ",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (test: MedicalTest) => {
    setEditingTest(test);
    setFormData({
      test_name: test.test_name,
      test_date: test.test_date || "",
      ai_summary: test.ai_summary || "",
      user_notes: test.user_notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      test_name: "",
      test_date: "",
      ai_summary: "",
      user_notes: "",
    });
    setEditingTest(null);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Анализы и обследования</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить анализ
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTest ? "Редактировать анализ" : "Добавить анализ"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test_name">Название анализа *</Label>
                <Input
                  id="test_name"
                  value={formData.test_name}
                  onChange={(e) =>
                    setFormData({ ...formData, test_name: e.target.value })
                  }
                  required
                  placeholder="Введите название или выберите из списка"
                  list="common-tests"
                />
                <datalist id="common-tests">
                  {COMMON_TESTS.map((test) => (
                    <option key={test} value={test} />
                  ))}
                </datalist>
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
                >
                  Отмена
                </Button>
                <Button type="submit">
                  {editingTest ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {tests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>У вас пока нет добавленных анализов</p>
          <p className="text-sm mt-2">
            Нажмите кнопку "Добавить анализ" чтобы начать
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Название анализа</TableHead>
                <TableHead className="w-[12%]">Дата сдачи</TableHead>
                <TableHead className="w-[28%]">Резюме от AI</TableHead>
                <TableHead className="w-[28%]">Ваши заметки</TableHead>
                <TableHead className="w-[7%] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium">
                    {test.test_name}
                  </TableCell>
                  <TableCell>
                    {test.test_date
                      ? format(new Date(test.test_date), "dd.MM.yyyy", {
                          locale: ru,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {test.ai_summary || (
                      <span className="text-muted-foreground italic">
                        Не указано
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {test.user_notes || (
                      <span className="text-muted-foreground italic">
                        Нет заметок
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(test)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(test.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default MedicalTestsForm;
