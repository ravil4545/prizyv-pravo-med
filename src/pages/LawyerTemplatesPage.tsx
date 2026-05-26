import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowLeft, Crown } from "lucide-react";
import TemplatePickerDialog from "@/components/TemplatePickerDialog";
import { TEMPLATES, CATEGORIES, type Template } from "@/lib/lawyerTemplates";

const LawyerTemplatesPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isLawyer, isPro, loading: profileLoading } = useLawyerProfile();

  const [activeCategory, setActiveCategory] = useState("Все");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (profileLoading || authLoading) return;
    if (!user) { navigate("/auth?next=/lawyer/templates", { replace: true }); return; }
    if (!isLawyer) { navigate("/dashboard", { replace: true }); return; }
  }, [user, authLoading, profileLoading, isLawyer, navigate]);

  const openTemplate = (tpl: Template) => {
    if (tpl.isPro && !isPro) return;
    setInitialTemplate(tpl);
    setPickerOpen(true);
  };

  const filtered = TEMPLATES.filter((t) => activeCategory === "Все" || t.category === activeCategory);

  if (profileLoading || authLoading || !user || !isLawyer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/lawyer"><ArrowLeft className="h-4 w-4 mr-1" />Кабинет</Link>
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />Шаблоны документов
          </h1>
        </div>

        {!isPro && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm">
              Pro-шаблоны доступны после перехода на тариф <strong>Pro</strong>. Базовые шаблоны бесплатны.
            </p>
            <Button size="sm" className="ml-auto bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0">
              Upgrade
            </Button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap mb-6">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Чтобы открыть шаблон сразу с данными конкретного клиента — открывайте из его карточки на вкладке «Шаблоны».
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tpl) => {
            const locked = tpl.isPro && !isPro;
            return (
              <Card
                key={tpl.key}
                className={`relative ${locked ? "opacity-70" : "hover:shadow-md cursor-pointer"} transition-shadow`}
                onClick={() => openTemplate(tpl)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-xs">{tpl.category}</Badge>
                    {tpl.isPro && (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                        <Crown className="h-3 w-3 mr-1" />Pro
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base leading-snug mt-2">{tpl.title}</CardTitle>
                  <CardDescription className="text-xs">{tpl.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" disabled={locked} className="w-full">
                    {locked ? "Требуется Pro" : "Открыть шаблон"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
      <Footer />

      <TemplatePickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setInitialTemplate(null);
        }}
        isPro={isPro}
      />
      {/* Если хотим — можно прокидывать initialTemplate как «открыть сразу», но
          сейчас TemplatePickerDialog показывает галерею; ключ initialTemplate
          оставлен для будущей итерации */}
      {initialTemplate && null}
    </div>
  );
};

export default LawyerTemplatesPage;
