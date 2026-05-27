import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Блок «У меня есть код от юриста» в клиентском кабинете.
 * Заменяет хрупкий поток с UUID. Юрист даёт клиенту 8-символьный код, клиент
 * вставляет его — БД сама привязывает client_user_id и открывает доступ к
 * меддокам через RPC claim_lawyer_invite (SECURITY DEFINER).
 */
const LawyerInviteRedeem = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ name: string } | null>(null);

  // Если пришёл по ссылке /dashboard?lawyer_invite=XXXX — авто-заполняем код.
  useEffect(() => {
    const fromUrl = searchParams.get("lawyer_invite");
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, [searchParams]);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase().replace(/\s+/g, "");
    if (trimmed.length < 4) {
      toast({ title: "Введите код приглашения", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("claim_lawyer_invite", { p_code: trimmed });
    setLoading(false);
    if (error) {
      toast({
        title: "Не удалось привязаться",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setSuccess({ name: row?.client_name || "Юрист" });
    setCode("");
    toast({ title: "Готово", description: "Юрист получил доступ к вашим документам" });
  };

  if (success) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Вы привязаны к юристу</p>
            <p className="text-xs text-muted-foreground">
              Юрист видит ваши медицинские документы и будет писать в чате.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/client/messages")}>
            Открыть чат
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" />
          У меня есть код от юриста
        </CardTitle>
        <CardDescription>
          Юрист может прислать вам 8-символьный код. Введите его — и юрист получит доступ к вашим
          медицинским документам, а вы — к чату с ним.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 flex-col sm:flex-row">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            maxLength={12}
            className="font-mono tracking-widest text-center text-base uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button onClick={submit} disabled={loading || code.length < 4}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Привязаться
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Без вашего согласия юрист не видит документы. Доступ можно отозвать в любой момент.
        </p>
      </CardContent>
    </Card>
  );
};

export default LawyerInviteRedeem;
