import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, Copy, Check, Users, Info, UserPlus, ShieldOff } from "lucide-react";

interface LawyerEntry {
  id: string;
  lawyer_id: string;
  client_name: string;
  created_at: string;
}

interface AccessGrant {
  id: string;
  lawyer_id: string;
  is_active: boolean;
}

const ShareWithLawyer = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lawyers, setLawyers] = useState<LawyerEntry[]>([]);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [manualId, setManualId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user?.id]);

  const load = async () => {
    const [{ data: lawyerRows }, { data: grantRows }] = await Promise.all([
      supabase.from("lawyer_clients").select("id, lawyer_id, client_name, created_at").eq("client_user_id", user!.id),
      supabase.from("client_document_access").select("id, lawyer_id, is_active").eq("client_user_id", user!.id),
    ]);
    setLawyers((lawyerRows as LawyerEntry[]) || []);
    setGrants((grantRows as AccessGrant[]) || []);
    setLoading(false);
  };

  const grantAccess = async (lawyerId: string) => {
    const { error } = await supabase.from("client_document_access").upsert(
      { client_user_id: user!.id, lawyer_id: lawyerId, is_active: true },
      { onConflict: "client_user_id,lawyer_id" }
    );
    if (error) { toast({ title: "Ошибка", description: error.message, variant: "destructive" }); return; }
    await load();
    toast({ title: "Доступ открыт", description: "Юрист теперь может просматривать ваши документы" });
  };

  const revokeAccess = async (lawyerId: string) => {
    const { error } = await supabase.from("client_document_access")
      .update({ is_active: false })
      .eq("client_user_id", user!.id)
      .eq("lawyer_id", lawyerId);
    if (error) { toast({ title: "Ошибка", description: error.message, variant: "destructive" }); return; }
    await load();
    toast({ title: "Доступ отозван" });
  };

  const addManual = async () => {
    const id = manualId.trim();
    if (!id) return;
    setAdding(true);
    await grantAccess(id);
    setManualId("");
    setAdding(false);
  };

  const copyUserId = async () => {
    await navigator.clipboard.writeText(user!.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "ID скопирован" });
  };

  const isGranted = (lawyerId: string) => grants.find((g) => g.lawyer_id === lawyerId)?.is_active === true;
  const activeCount = grants.filter((g) => g.is_active).length;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Доступ юриста к документам
          {activeCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">
              {activeCount} юрист{activeCount > 1 ? "а" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info */}
        <div className="flex gap-2 p-3 bg-blue-100/60 rounded-lg text-sm">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-blue-800 dark:text-blue-200">
            Разрешите юристу просматривать ваши медицинские документы. Доступ можно отозвать в любой момент.
          </p>
        </div>

        {/* Your ID */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Ваш ID (передайте юристу для привязки)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs font-mono break-all">{user?.id}</code>
            <Button variant="outline" size="icon" className="flex-shrink-0 h-9 w-9" onClick={copyUserId}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Lawyers who added this client */}
        {!loading && lawyers.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Юристы, которые вас добавили</p>
            <div className="space-y-2">
              {lawyers.map((l) => {
                const granted = isGranted(l.lawyer_id);
                return (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{l.client_name || "Юрист"}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{l.lawyer_id}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {granted
                        ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Доступ открыт</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Нет доступа</Badge>}
                      {granted
                        ? (
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive gap-1"
                            onClick={() => revokeAccess(l.lawyer_id)}>
                            <ShieldOff className="h-3.5 w-3.5" />Отозвать
                          </Button>
                        )
                        : (
                          <Button variant="default" size="sm" className="h-8 text-xs gap-1"
                            onClick={() => grantAccess(l.lawyer_id)}>
                            <Shield className="h-3.5 w-3.5" />Разрешить
                          </Button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && lawyers.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <Users className="h-4 w-4 flex-shrink-0" />
            <p>Ни один юрист пока не добавил вас в свою CRM.</p>
          </div>
        )}

        {/* Manual grant by lawyer ID */}
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Открыть доступ вручную (введите ID юриста)</p>
          <div className="flex gap-2">
            <Input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="UUID юриста"
              className="flex-1 text-xs font-mono"
            />
            <Button size="sm" onClick={addManual} disabled={!manualId.trim() || adding} className="gap-1 flex-shrink-0">
              <UserPlus className="h-3.5 w-3.5" />
              {adding ? "..." : "Разрешить"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ShareWithLawyer;
