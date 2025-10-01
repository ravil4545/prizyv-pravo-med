import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

interface Diagnosis {
  id: string;
  title: string;
  description: string;
  article_number: string;
  category: string;
}

const DiagnosesPage = () => {
  const { toast } = useToast();
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredDiagnoses, setFilteredDiagnoses] = useState<Diagnosis[]>([]);

  useEffect(() => {
    loadDiagnoses();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = diagnoses.filter(
        (d) =>
          d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.article_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredDiagnoses(filtered);
    } else {
      setFilteredDiagnoses(diagnoses);
    }
  }, [searchTerm, diagnoses]);

  const loadDiagnoses = async () => {
    const { data, error } = await supabase
      .from("diagnoses")
      .select("*")
      .order("title");

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить диагнозы",
        variant: "destructive",
      });
    } else {
      setDiagnoses(data || []);
      setFilteredDiagnoses(data || []);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-4 gradient-text">
            Непризывные диагнозы
          </h1>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Справочная информация о медицинских диагнозах, дающих основание для освобождения от призыва
          </p>

          <div className="mb-8">
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                type="text"
                placeholder="Поиск по диагнозам..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {filteredDiagnoses.map((diagnosis) => (
              <Card key={diagnosis.id} className="glass-card hover-lift">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-xl">{diagnosis.title}</CardTitle>
                    {diagnosis.category && (
                      <Badge variant="secondary">{diagnosis.category}</Badge>
                    )}
                  </div>
                  <CardDescription>
                    Статья {diagnosis.article_number} расписания болезней
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground/90">{diagnosis.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredDiagnoses.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Диагнозы не найдены</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DiagnosesPage;