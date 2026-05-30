import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircleQuestion, Loader2, Sparkles } from "lucide-react";

// Ассистент по делу (грунтованный): свободный вопрос юриста по конкретному
// клиенту → ответ через edge-функцию lawyer-case-assistant (Context Bundle +
// инструменты search_rb/read_document). Это не сохраняемый чат, а разовый
// запрос-ответ по материалам дела.

interface Props {
  lawyerClientId: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const SAMPLE_QUESTIONS = [
  "Какая статья Расписания болезней подходит под диагноз и почему?",
  "Каких документов не хватает для категории «В»?",
  "Есть ли противоречия в датах обследований?",
];

const TOOL_LABEL: Record<string, string> = {
  search_rb: "поиск по РБ",
  get_rb_article: "статья РБ",
  read_document: "чтение документа",
  request_missing_info: "запрос данных",
  flag_low_confidence: "пометка сомнения",
};

const LawyerCaseAssistant = ({ lawyerClientId, isPro, onUpgrade }: Props) => {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    if (!isPro) {
      onUpgrade();
      return;
    }
    setLoading(true);
    setAnswer("");
    setToolsUsed([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("lawyer-case-assistant", {
        body: { lawyerClientId, question: text },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      setAnswer(res.data?.answer || "Пустой ответ.");
      setToolsUsed((res.data?.toolsUsed as string[]) || []);
    } catch (err) {
      toast({
        title: "Не удалось получить ответ",
        description: err instanceof Error ? err.message : "Ошибка ИИ",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
          Спросить по делу
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Например: какая статья РБ подходит под диагноз и каких обследований не хватает?"
        />
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_QUESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
              disabled={loading}
              className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => ask()} disabled={loading || !question.trim()}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Спросить
          </Button>
        </div>

        {answer && (
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{answer}</p>
            {toolsUsed.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Источники:</span>
                {[...new Set(toolsUsed)].map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {TOOL_LABEL[t] || t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          ИИ-ассистент опирается на документы дела и Расписание болезней. Это не заменяет ваше
          юридическое заключение и решение ВВК.
        </p>
      </CardContent>
    </Card>
  );
};

export default LawyerCaseAssistant;
