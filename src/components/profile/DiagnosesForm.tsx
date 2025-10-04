import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";

interface Diagnosis {
  id?: string;
  diagnosis_name: string;
  diagnosis_code: string;
  medical_documents: string;
  ai_fitness_category: string;
  user_article: string;
  user_fitness_category: string;
  notes: string;
}

interface DiagnosesFormProps {
  userId: string;
}

const DiagnosesForm = ({ userId }: DiagnosesFormProps) => {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadDiagnoses();
  }, [userId]);

  const loadDiagnoses = async () => {
    const { data, error } = await supabase
      .from("user_diagnoses")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error loading diagnoses:", error);
      return;
    }

    if (data && data.length > 0) {
      setDiagnoses(data);
    } else {
      setDiagnoses([createEmptyDiagnosis()]);
    }
  };

  const createEmptyDiagnosis = (): Diagnosis => ({
    diagnosis_name: "",
    diagnosis_code: "",
    medical_documents: "",
    ai_fitness_category: "",
    user_article: "",
    user_fitness_category: "",
    notes: "",
  });

  const handleAddDiagnosis = () => {
    setDiagnoses([...diagnoses, createEmptyDiagnosis()]);
  };

  const handleRemoveDiagnosis = async (index: number) => {
    const diagnosis = diagnoses[index];
    
    if (diagnosis.id) {
      const { error } = await supabase
        .from("user_diagnoses")
        .delete()
        .eq("id", diagnosis.id);

      if (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось удалить диагноз",
          variant: "destructive",
        });
        return;
      }
    }

    const newDiagnoses = diagnoses.filter((_, i) => i !== index);
    setDiagnoses(newDiagnoses.length > 0 ? newDiagnoses : [createEmptyDiagnosis()]);
    
    toast({
      title: "Удалено",
      description: "Диагноз удален",
    });
  };

  const handleUpdateDiagnosis = (index: number, field: keyof Diagnosis, value: string) => {
    const newDiagnoses = [...diagnoses];
    newDiagnoses[index] = { ...newDiagnoses[index], [field]: value };
    setDiagnoses(newDiagnoses);
  };

  const handleAICategory = async (index: number) => {
    const diagnosis = diagnoses[index];
    
    if (!diagnosis.diagnosis_name) {
      toast({
        title: "Заполните диагноз",
        description: "Укажите название диагноза для получения категории",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-diagnosis", {
        body: {
          diagnosisName: diagnosis.diagnosis_name,
          diagnosisCode: diagnosis.diagnosis_code,
        },
      });

      if (error) throw error;

      if (data?.category) {
        handleUpdateDiagnosis(index, "ai_fitness_category", data.category);
        toast({
          title: "AI определил категорию",
          description: data.category,
        });
      }
    } catch (error) {
      console.error("Error getting AI category:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось получить категорию от AI",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const diagnosis of diagnoses) {
        if (!diagnosis.diagnosis_name) continue;

        if (diagnosis.id) {
          const { error } = await supabase
            .from("user_diagnoses")
            .update(diagnosis)
            .eq("id", diagnosis.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_diagnoses")
            .insert([{ ...diagnosis, user_id: userId }]);

          if (error) throw error;
        }
      }

      toast({
        title: "Успешно",
        description: "Диагнозы сохранены",
      });

      await loadDiagnoses();
    } catch (error) {
      console.error("Error saving diagnoses:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить диагнозы",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {diagnoses.map((diagnosis, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Диагноз {index + 1}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAICategory(index)}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveDiagnosis(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Укажите информацию о диагнозе. AI поможет определить категорию годности
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Название диагноза</Label>
                <Input
                  value={diagnosis.diagnosis_name}
                  onChange={(e) => handleUpdateDiagnosis(index, "diagnosis_name", e.target.value)}
                  placeholder="Например: Сколиоз 2 степени"
                />
              </div>

              <div>
                <Label>Код по МКБ-10</Label>
                <Input
                  value={diagnosis.diagnosis_code}
                  onChange={(e) => handleUpdateDiagnosis(index, "diagnosis_code", e.target.value)}
                  placeholder="M41.1"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Имеющиеся медицинские документы</Label>
                <Textarea
                  value={diagnosis.medical_documents}
                  onChange={(e) => handleUpdateDiagnosis(index, "medical_documents", e.target.value)}
                  placeholder="Перечислите документы: выписки, снимки, заключения..."
                  rows={2}
                />
              </div>

              <div>
                <Label>AI категория годности</Label>
                <Input
                  value={diagnosis.ai_fitness_category}
                  readOnly
                  placeholder="Будет заполнено AI"
                  className="bg-muted"
                />
              </div>

              <div>
                <Label>Ваша предполагаемая категория</Label>
                <Input
                  value={diagnosis.user_fitness_category}
                  onChange={(e) => handleUpdateDiagnosis(index, "user_fitness_category", e.target.value)}
                  placeholder="В, Г, Д"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Статья расписания болезней</Label>
                <Input
                  value={diagnosis.user_article}
                  onChange={(e) => handleUpdateDiagnosis(index, "user_article", e.target.value)}
                  placeholder="Например: Статья 66"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Примечания</Label>
                <Textarea
                  value={diagnosis.notes}
                  onChange={(e) => handleUpdateDiagnosis(index, "notes", e.target.value)}
                  placeholder="Дополнительная информация..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2">
        <Button onClick={handleAddDiagnosis} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Добавить диагноз
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сохранить все диагнозы
        </Button>
      </div>
    </div>
  );
};

export default DiagnosesForm;
