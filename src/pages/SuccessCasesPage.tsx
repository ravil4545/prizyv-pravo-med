import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Plus, Search, CheckCircle2, Calendar } from "lucide-react";

interface SuccessCase {
  id: string;
  diagnosis_codes: string[];
  fitness_category: string;
  outcome: string;
  description: string;
  region: string | null;
  year: number | null;
  created_at: string;
}

const FITNESS_CATEGORIES = ["В", "Г", "Д", "Б", "А"];

export default function SuccessCasesPage() {
  const [cases, setCases] = useState<SuccessCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    diagnosis_codes: "",
    fitness_category: "В",
    outcome: "",
    description: "",
    region: "",
    year: new Date().getFullYear().toString(),
  });

  useEffect(() => {
    loadCases();
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
  }, []);

  const loadCases = async () => {
    const { data } = await supabase
      .from("success_cases")
      .select("*")
      .eq("is_approved", true)
      .order("created_at", { ascending: false });
    setCases(data || []);
    setLoading(false);
  };

  const submitCase = async () => {
    if (!form.description.trim() || !form.outcome.trim()) {
      toast({ title: "Заполните обязательные поля", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const codes = form.diagnosis_codes.split(",").map(s => s.trim()).filter(Boolean);
      await supabase.from("success_cases").insert({
        diagnosis_codes: codes,
        fitness_category: form.fitness_category,
        outcome: form.outcome.trim(),
        description: form.description.trim(),
        region: form.region.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        is_approved: false,
      });
      toast({ title: "Кейс отправлен на проверку", description: "После модерации он появится в базе" });
      setDialogOpen(false);
    } catch {
      toast({ title: "Ошибка отправки", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = cases.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.description.toLowerCase().includes(q)
      || c.outcome.toLowerCase().includes(q)
      || c.diagnosis_codes.join(" ").toLowerCase().includes(q)
      || (c.region || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Trophy className="h-8 w-8 text-amber-500" />
              <h1 className="text-3xl md:text-4xl font-bold">База успешных кейсов</h1>
            </div>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Реальные истории призывников, получивших непризывную категорию. Все кейсы анонимны.
            </p>
          </div>

          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по диагнозу, региону, результату..." className="pl-9" />
            </div>
            {user && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2 flex-shrink-0">
                <Plus className="h-4 w-4" />
                Поделиться кейсом
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Trophy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{search ? "По запросу ничего не найдено" : "База кейсов пока пустая"}</p>
              {user && !search && (
                <Button variant="outline" onClick={() => setDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Добавить первый кейс
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((c) => (
                <Card key={c.id} className="hover:shadow-soft transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 border">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Категория {c.fitness_category}
                        </Badge>
                        {c.diagnosis_codes.map(code => (
                          <Badge key={code} variant="outline" className="text-xs">{code}</Badge>
                        ))}
                        {c.region && <Badge variant="secondary" className="text-xs">{c.region}</Badge>}
                      </div>
                      {c.year && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {c.year}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground mb-2">{c.outcome}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{c.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Поделиться кейсом</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Ваш кейс анонимен. После проверки модератором он появится в базе.</p>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Категория годности</Label>
                <Select value={form.fitness_category} onValueChange={v => setForm(f => ({ ...f, fitness_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FITNESS_CATEGORIES.map(c => <SelectItem key={c} value={c}>Категория {c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Год</Label>
                <Input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2024" type="number" min="2000" max="2030" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Статьи/диагнозы (через запятую)</Label>
              <Input value={form.diagnosis_codes} onChange={e => setForm(f => ({ ...f, diagnosis_codes: e.target.value }))} placeholder="Ст. 13В, гипертония, плоскостопие" />
            </div>
            <div className="space-y-1.5">
              <Label>Результат <span className="text-destructive">*</span></Label>
              <Input value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} placeholder="Признан не годным / получил категорию В" />
            </div>
            <div className="space-y-1.5">
              <Label>Описание истории <span className="text-destructive">*</span></Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Опишите что помогло, какие документы предоставляли, как проходила комиссия..." rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Регион (необязательно)</Label>
              <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Москва" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Отмена</Button>
              <Button onClick={submitCase} disabled={saving} className="flex-1">{saving ? "Отправляем..." : "Отправить"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
