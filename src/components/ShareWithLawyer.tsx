import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Copy, Check, Trash2, Users, Info } from "lucide-react";

interface AccessGrant {
  id: string;
  lawyer_id: string;
  is_active: boolean;
  created_at: string;
}

const ShareWithLawyer = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadGrants();
  }, [user?.id]);

  const loadGrants = async () => {
    const { data } = await supabase
      .from("client_document_access")
      .select("*")
      .eq("client_user_id", user!.id)
      .order("created_at", { ascending: false });
    setGrants((data as AccessGrant[]) || []);
    setLoading(false);
  };

  const copyUserId = async () => {
    await navigator.clipboard.writeText(user!.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "ID скопирован" });
  };

  const revokeAccess = async (grantId: string) => {
    await supabase.from("client_document_access").update({ is_active: false }).eq("id", grantId);
    setGrants((prev) => prev.map((g) => g.id === grantId ? { ...g, is_active: false } : g));
    toast({ title: "Доступ отозван" });
  };

  const reGrantAccess = async (lawyerId: string) => {
    const { error } = await supabase
      .from("client_document_access")
      .upsert({ client_user_id: user!.id, lawyer_id: lawyerId, is_active: true }, { onConflict: "client_user_id,lawyer_id" });
    if (!error) {
      await loadGrants();
      toast({ title: "Доступ восстановлен" });
    }
  };

  const activeCount = grants.filter((g) => g.is_active).length;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Доступ юриста к документам
          {activeCount > 0 && <Badge className="bg-blue-100 text-blue-700 border-blue-200">{activeCount} юрист{activeCount > 1 ? "а" : ""}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* How it works */}
        <div className="flex gap-2 p-3 bg-blue-100/60 rounded-lg text-sm">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-blue-800 dark:text-blue-200">
            Сообщите свой ID юристу — он добавит вас в свою CRM и получит доступ к вашим документам.
            Вы всегда можете отозвать доступ.
          </p>
        </div>

        {/* User ID */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Ваш ID (передайте юристу)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs font-mono break-all">{user?.id}</code>
            <Button variant="outline" size="icon" className="flex-shrink-0 h-9 w-9" onClick={copyUserId}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Grants list */}
        {!loading && grants.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Юристы с доступом</p>
            <div className="space-y-2">
              {grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground truncate">{g.lawyer_id}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      с {new Date(g.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {g.is_active
                      ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Активен</Badge>
                      : <Badge variant="outline" className="text-xs text-muted-foreground">Отозван</Badge>}
                    {g.is_active
                      ? <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => revokeAccess(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      : <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => reGrantAccess(g.lawyer_id)}>Восстановить</Button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && grants.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <p>Ни один юрист пока не добавил вас. Передайте им свой ID выше.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ShareWithLawyer;
