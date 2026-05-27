import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATES,
  CATEGORIES,
  type Template,
  type ClientPrefillSource,
  generateTemplatePdf,
  downloadTemplateDocx,
  prefillFromClient,
  todayRu,
} from "@/lib/lawyerTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, ArrowLeft, Copy, Check, Download, FileText } from "lucide-react";

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Если задан — поля шаблона автозаполнятся из данных клиента */
  prefillSource?: ClientPrefillSource | null;
  /** Pro-шаблоны блокируются если false */
  isPro?: boolean;
}

/**
 * Универсальный диалог выбора и заполнения шаблона документа.
 * Используется и на /lawyer/templates, и в карточке клиента
 * (тогда передаём prefillSource — поля автозаполнятся).
 */
const TemplatePickerDialog = ({
  open,
  onOpenChange,
  prefillSource = null,
  isPro = false,
}: TemplatePickerDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("Все");
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [copied, setCopied] = useState(false);

  // При закрытии диалога — сбрасываем выбранный шаблон, чтобы при повторном
  // открытии снова показывалась галерея
  useEffect(() => {
    if (!open) {
      setActiveTemplate(null);
      setFields({});
      setPreview("");
    }
  }, [open]);

  const openTemplate = (tpl: Template) => {
    setActiveTemplate(tpl);
    const initial = prefillSource
      ? prefillFromClient(tpl, prefillSource)
      : tpl.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key === "date" ? todayRu() : "" }), {});
    setFields(initial);
    setPreview(tpl.body(initial));
  };

  const updateField = (key: string, value: string) => {
    const updated = { ...fields, [key]: value };
    setFields(updated);
    if (activeTemplate) setPreview(activeTemplate.body(updated));
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Скопировано в буфер обмена" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  const logUse = async () => {
    if (!user || !activeTemplate) return;
    try {
      await supabase.from("lawyer_template_uses").insert({
        lawyer_id: user.id,
        template_key: activeTemplate.key,
      });
    } catch (e) {
      // тихо игнорируем — статистика не критична
      console.error("template_uses insert failed", e);
    }
  };

  const downloadDocx = async () => {
    if (!activeTemplate) return;
    try {
      await downloadTemplateDocx(activeTemplate, fields);
      await logUse();
      toast({ title: "DOCX скачан" });
    } catch (e) {
      console.error("DOCX generation failed", e);
      const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
      toast({
        title: "Не удалось сгенерировать DOCX",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const downloadPdf = async () => {
    if (!activeTemplate) return;
    const doc = generateTemplatePdf(activeTemplate, fields);
    doc.save(`${activeTemplate.key}_${Date.now()}.pdf`);
    await logUse();
    toast({ title: "PDF скачан" });
  };

  const filtered = TEMPLATES.filter((t) => activeCategory === "Все" || t.category === activeCategory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 flex flex-col">
        <DialogHeader className="px-5 py-4 border-b flex flex-row items-center justify-between space-y-0">
          {activeTemplate ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => setActiveTemplate(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                К шаблонам
              </Button>
              <DialogTitle className="text-base truncate flex-1">{activeTemplate.title}</DialogTitle>
            </div>
          ) : (
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Шаблоны документов
              {prefillSource?.client_name && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  Авто-заполнение: {prefillSource.client_name}
                </Badge>
              )}
            </DialogTitle>
          )}
        </DialogHeader>

        {activeTemplate ? (
          /* ── Редактор шаблона ─────────────────────────────────────────── */
          <div className="grid md:grid-cols-2 gap-4 p-5 overflow-hidden flex-1">
            <ScrollArea className="md:h-[calc(92vh-160px)]">
              <div className="space-y-3 pr-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Заполните поля {prefillSource ? "(подставлены из карточки клиента)" : ""}
                </p>
                {activeTemplate.fields.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    {f.multiline ? (
                      <Textarea
                        value={fields[f.key] || ""}
                        onChange={(e) => updateField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        value={fields[f.key] || ""}
                        onChange={(e) => updateField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-3 min-h-0">
              <p className="text-sm font-medium text-muted-foreground">Предпросмотр</p>
              <ScrollArea className="border rounded-lg p-4 bg-muted/30 flex-1 md:max-h-[calc(92vh-260px)]">
                <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans">{preview}</pre>
              </ScrollArea>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyText} className="flex-1 min-w-[120px]">
                  {copied ? (
                    <><Check className="h-4 w-4 mr-1" />Скопировано</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-1" />Копировать</>
                  )}
                </Button>
                <Button size="sm" onClick={downloadDocx} className="flex-1 min-w-[140px]">
                  <Download className="h-4 w-4 mr-1" />Скачать DOCX
                </Button>
                <Button variant="outline" size="sm" onClick={downloadPdf} className="flex-1 min-w-[120px]">
                  <Download className="h-4 w-4 mr-1" />PDF
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                DOCX корректно отображает кириллицу; PDF — резервный вариант.
              </p>
            </div>
          </div>
        ) : (
          /* ── Галерея шаблонов ─────────────────────────────────────────── */
          <div className="flex flex-col overflow-hidden flex-1">
            <div className="flex gap-2 flex-wrap px-5 py-3 border-b flex-shrink-0">
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
            <ScrollArea className="flex-1">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
                {filtered.map((tpl) => {
                  const locked = tpl.isPro && !isPro;
                  return (
                    <Card
                      key={tpl.key}
                      className={`relative ${locked ? "opacity-70" : "hover:shadow-md cursor-pointer"} transition-shadow`}
                      onClick={() => !locked && openTemplate(tpl)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <Badge variant="outline" className="text-[10px]">{tpl.category}</Badge>
                          {tpl.isPro && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                              <Crown className="h-3 w-3 mr-1" />Pro
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-sm leading-snug mt-2">{tpl.title}</CardTitle>
                        <CardDescription className="text-xs">{tpl.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button size="sm" disabled={locked} className="w-full">
                          {locked ? "Требуется Pro" : "Открыть"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePickerDialog;
