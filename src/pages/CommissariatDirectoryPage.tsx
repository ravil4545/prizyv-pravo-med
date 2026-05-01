import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, Star, Plus, MapPin } from "lucide-react";

interface Rating {
  id: string;
  commissariat_name: string;
  city: string;
  region: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface GroupedCommissariat {
  name: string;
  city: string;
  region: string | null;
  avgRating: number;
  count: number;
  ratings: Rating[];
}

export default function CommissariatDirectoryPage() {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    commissariat_name: "",
    city: "",
    region: "",
    rating: 3,
    comment: "",
  });

  useEffect(() => {
    loadRatings();
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
  }, []);

  const loadRatings = async () => {
    const { data } = await supabase
      .from("commissariat_ratings")
      .select("*")
      .order("created_at", { ascending: false });
    setRatings(data || []);
    setLoading(false);
  };

  const submitRating = async () => {
    if (!form.commissariat_name.trim() || !form.city.trim()) {
      toast({ title: "Укажите военкомат и город", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Требуется авторизация", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supabase.from("commissariat_ratings").insert({
        commissariat_name: form.commissariat_name.trim(),
        city: form.city.trim(),
        region: form.region.trim() || null,
        rating: form.rating,
        comment: form.comment.trim() || null,
        user_id: user.id,
      });
      toast({ title: "Отзыв добавлен", description: "Спасибо за помощь другим призывникам!" });
      setDialogOpen(false);
      loadRatings();
    } catch {
      toast({ title: "Ошибка добавления", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Group by commissariat
  const grouped: Record<string, GroupedCommissariat> = {};
  for (const r of ratings) {
    const key = `${r.commissariat_name}|${r.city}`;
    if (!grouped[key]) {
      grouped[key] = { name: r.commissariat_name, city: r.city, region: r.region, avgRating: 0, count: 0, ratings: [] };
    }
    grouped[key].ratings.push(r);
    grouped[key].count++;
  }
  for (const g of Object.values(grouped)) {
    g.avgRating = g.ratings.reduce((s, r) => s + r.rating, 0) / g.count;
  }

  const filteredGroups = Object.values(grouped).filter(g => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return g.name.toLowerCase().includes(q) || g.city.toLowerCase().includes(q) || (g.region || "").toLowerCase().includes(q);
  }).sort((a, b) => b.avgRating - a.avgRating);

  const StarRow = ({ value, max = 5, interactive = false, onChange }: { value: number; max?: number; interactive?: boolean; onChange?: (v: number) => void }) => (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => interactive && onChange?.(i + 1)}
          className={interactive ? "cursor-pointer" : "cursor-default"}
        >
          <Star className={`h-4 w-4 ${i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Building2 className="h-8 w-8 text-primary" />
              <h1 className="text-3xl md:text-4xl font-bold">Справочник военкоматов</h1>
            </div>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Рейтинги военкоматов от призывников. Поделитесь опытом — помогите другим.
            </p>
          </div>

          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по городу или названию..." className="pl-9" />
            </div>
            {user && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2 flex-shrink-0">
                <Plus className="h-4 w-4" /> Добавить отзыв
              </Button>
            )}
            {!user && (
              <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-2 flex-shrink-0 hidden sm:flex">
                <Plus className="h-4 w-4" /> Добавить отзыв
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{search ? "По запросу ничего не найдено" : "Отзывов пока нет"}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Будьте первым, кто поделится опытом</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((g) => (
                <Card key={`${g.name}|${g.city}`} className="hover:shadow-soft transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-semibold text-foreground">{g.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mb-3">
                          <span>{g.city}</span>
                          {g.region && <><span>·</span><span>{g.region}</span></>}
                          <span>·</span>
                          <span>{g.count} {g.count === 1 ? "отзыв" : g.count < 5 ? "отзыва" : "отзывов"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StarRow value={g.avgRating} />
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {g.avgRating.toFixed(1)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {g.ratings.filter(r => r.comment).slice(0, 2).map(r => (
                      <div key={r.id} className="mt-3 pt-3 border-t border-border/40">
                        <div className="flex items-center gap-2 mb-1">
                          <StarRow value={r.rating} />
                          <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.comment}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить отзыв о военкомате</DialogTitle>
          </DialogHeader>
          {!user && <p className="text-sm text-muted-foreground -mt-2">Для добавления отзыва необходима авторизация.</p>}
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Название военкомата <span className="text-destructive">*</span></Label>
              <Input value={form.commissariat_name} onChange={e => setForm(f => ({ ...f, commissariat_name: e.target.value }))} placeholder="Военный комиссариат Центрального района" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Город <span className="text-destructive">*</span></Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Москва" />
              </div>
              <div className="space-y-1.5">
                <Label>Регион</Label>
                <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Московская обл." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Оценка</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} type="button" onClick={() => setForm(f => ({ ...f, rating: i }))}>
                    <Star className={`h-7 w-7 transition-colors ${i <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Комментарий</Label>
              <Textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Расскажите о своём опыте взаимодействия с военкоматом..." rows={3} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Отмена</Button>
              <Button onClick={submitRating} disabled={saving || !user} className="flex-1">{saving ? "Сохраняем..." : "Добавить"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
