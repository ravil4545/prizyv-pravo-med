import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { withBrandPath } from "@/lib/brandPath";
import { CheckCircle2, Loader2, MessageSquare, Ticket } from "lucide-react";

const LawyerInviteRedeem = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ clientName: string; lawyerClientId: string } | null>(null);

  const brandedPath = (target: string) => withBrandPath(location.pathname, target);

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
        title: "Не удалось подключиться к юристу",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const lawyerClientId = row?.lawyer_client_id;
    if (!lawyerClientId) {
      toast({
        title: "Связь создана, но чат не найден",
        description: "Обновите страницу кабинета и попробуйте открыть сообщения.",
      });
      return;
    }

    setSuccess({
      clientName: row?.client_name || "клиент",
      lawyerClientId,
    });
    setCode("");
    toast({
      title: "Юрист подключен",
      description: "Теперь можно писать в чат и управлять доступом к документам.",
    });
  };

  if (success) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Кабинет связан с юристом</p>
            <p className="text-xs text-muted-foreground">
              Юрист видит разрешенные документы и сможет вести переписку с вами в чате.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate(brandedPath(`/client/chat/${success.lawyerClientId}`))}
          >
            <MessageSquare className="h-4 w-4" />
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
          Код от юриста
        </CardTitle>
        <CardDescription>
          Введите код приглашения. После подтверждения юрист получит доступ к разрешенным документам,
          а у вас появится общий чат.
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
          <Button onClick={submit} disabled={loading || code.trim().length < 4}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Подключить
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Без вашего согласия юрист не видит документы. Доступ можно закрыть в любой момент.
        </p>
      </CardContent>
    </Card>
  );
};

export default LawyerInviteRedeem;
