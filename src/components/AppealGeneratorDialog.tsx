import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Loader2, FileSignature, Copy, Check, Download, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CaseEventLite {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  outcome: string | null;
}

interface AppealGeneratorDialogProps {
  event: CaseEventLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Диалог генерации жалобы по событию case_events с отрицательным исходом.
 * Пользователь выбирает уровень обжалования (комиссия субъекта / суд),
 * добавляет уточнения — ИИ собирает черновик.
 */
export default function AppealGeneratorDialog({
  event,
  open,
  onOpenChange,
}: AppealGeneratorDialogProps) {
  const [level, setLevel] = useState<"subject" | "court">("subject");
  const [extraContext, setExtraContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setResult(null);
    setWarning(null);
    setExtraContext("");
    setLevel("subject");
    setGenerating(false);
    setCopied(false);
  };

  const handleGenerate = async () => {
    if (!event) return;
    setGenerating(true);
    setResult(null);
    setWarning(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-appeal", {
        body: {
          eventId: event.id,
          appealLevel: level,
          userContext: extraContext.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
        return;
      }
      setResult(data.text || "");
      setWarning(data.warning || null);
    } catch (err) {
      console.error("appeal gen error", err);
      toast({
        title: "Ошибка генерации",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Скопировано в буфер" });
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName =
      level === "court" ? "административное_исковое_заявление" : "жалоба_в_призывную_комиссию_субъекта";
    a.download = `${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-gold-deep" />
            Сгенерировать жалобу
          </DialogTitle>
          <DialogDescription>
            {event ? (
              <>
                Обжалование события «{event.title}» от {event.event_date}. ИИ соберёт черновик
                на базе вашего профиля, документов и AI-анализа.
              </>
            ) : (
              "Выберите событие с отрицательным исходом."
            )}
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-2 block">Куда подаём</Label>
                <RadioGroup value={level} onValueChange={(v) => setLevel(v as "subject" | "court")}>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-gold/40 cursor-pointer">
                    <RadioGroupItem value="subject" id="lvl-subject" className="mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Призывная комиссия субъекта РФ</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Рекомендуется как первый шаг. Срок подачи — 3 мес. Решение приостанавливается до рассмотрения.
                      </p>
                    </div>
                    <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
                      Рекомендуем
                    </Badge>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-gold/40 cursor-pointer">
                    <RadioGroupItem value="court" id="lvl-court" className="mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Суд (КАС РФ глава 22)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        С 2023 г. решение призывной комиссии при обжаловании в суд НЕ приостанавливается автоматически.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="extra-context" className="mb-1.5 block">
                  Дополнения <span className="text-muted-foreground">(необязательно)</span>
                </Label>
                <Textarea
                  id="extra-context"
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="Например: на комиссии не учли заключение невролога от 12.03; забрали оригиналы документов без расписки..."
                  rows={4}
                  className="text-sm"
                />
              </div>

              <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/40 border border-border/40">
                ⚠ Черновик основан на данных вашего кабинета. Перед подачей проверьте все
                фактические данные и приложения. Документ НЕ заменяет консультацию юриста.
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || !event}
                className="bg-gold-deep hover:bg-gold-deep/90 text-paper"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Генерирую…
                  </>
                ) : (
                  <>
                    <FileSignature className="h-4 w-4 mr-2" />
                    Сгенерировать
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {result && (
          <>
            {warning && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-seal/5 border border-seal/30 text-xs text-seal">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{warning}</span>
              </div>
            )}
            <div className="bg-paper-deep/30 border border-gold/20 rounded-lg p-4 max-h-[55vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground">
                {result}
              </pre>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setResult(null)}>
                Сгенерировать снова
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                Копировать
              </Button>
              <Button
                onClick={handleDownload}
                className="bg-ink hover:bg-ink/90 text-paper"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Скачать
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
