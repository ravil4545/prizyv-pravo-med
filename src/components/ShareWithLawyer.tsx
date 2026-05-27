import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, FileText, Brain, Users, Info, ShieldOff, ShieldCheck,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";

interface LawyerEntry {
  id: string;
  lawyer_id: string;
  /** Имя клиента, которое юрист записал у себя — фактически отображаем как
   *  «как я записан у этого юриста». */
  client_name: string;
  created_at: string;
}

interface AccessGrant {
  id: string;
  lawyer_id: string;
  is_active: boolean;
}

interface LawyerProfileBrief {
  user_id: string;
  full_name: string | null;
  photo_url: string | null;
  brand_subtitle: string | null;
}

/**
 * Управление доступом клиента к юристам.
 *
 * Что показываем:
 *   1. Список юристов, которые добавили клиента в свою CRM (или к которым
 *      клиент привязался через invite-код).
 *   2. На каждого — switch «доступ открыт». Один клик — даёт юристу видеть
 *      медкарты + результаты ИИ-анализа этих документов в его кабинете.
 *   3. Master switch «открыть всем» / «закрыть всем».
 *   4. Чёткое объяснение, ЧТО увидит юрист.
 *
 * Что убрали (по сравнению с прошлой версией):
 *   • Поле ввода UUID юриста вручную — теперь работает invite-код от юриста.
 *   • Выдачу собственного UUID — клиент его искать не должен.
 */
const ShareWithLawyer = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lawyers, setLawyers] = useState<LawyerEntry[]>([]);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [profiles, setProfiles] = useState<Record<string, LawyerProfileBrief>>({});
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();

    // Realtime: если юрист в своей CRM что-то меняет (например, добавил вас) —
    // блок сразу обновится, без перезагрузки страницы.
    const ch = supabase
      .channel(`share-with-lawyer-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lawyer_clients", filter: `client_user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_document_access", filter: `client_user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    const [{ data: lawyerRows }, { data: grantRows }] = await Promise.all([
      supabase
        .from("lawyer_clients")
        .select("id, lawyer_id, client_name, created_at")
        .eq("client_user_id", user.id),
      supabase
        .from("client_document_access")
        .select("id, lawyer_id, is_active")
        .eq("client_user_id", user.id),
    ]);
    const lawyerEntries = (lawyerRows as LawyerEntry[]) || [];
    setLawyers(lawyerEntries);
    setGrants((grantRows as AccessGrant[]) || []);

    // Подтягиваем имена и фото юристов из lawyer_profiles — чтобы клиент видел
    // «Адвокат Иванова И.И.», а не UUID.
    if (lawyerEntries.length > 0) {
      const ids = Array.from(new Set(lawyerEntries.map((l) => l.lawyer_id)));
      const { data: profRows } = await supabase
        .from("lawyer_profiles")
        .select("user_id, full_name, photo_url, brand_subtitle")
        .in("user_id", ids);
      const map: Record<string, LawyerProfileBrief> = {};
      (profRows || []).forEach((p: any) => { map[p.user_id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  const setAccess = async (lawyerId: string, active: boolean) => {
    const { error } = await supabase
      .from("client_document_access")
      .upsert(
        { client_user_id: user!.id, lawyer_id: lawyerId, is_active: active },
        { onConflict: "client_user_id,lawyer_id" },
      );
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const toggleOne = async (lawyerId: string, next: boolean) => {
    // Оптимистично обновляем UI, чтобы переключатель не «прыгал»
    setGrants((prev) => {
      const idx = prev.findIndex((g) => g.lawyer_id === lawyerId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], is_active: next };
        return copy;
      }
      return [...prev, { id: `tmp-${lawyerId}`, lawyer_id: lawyerId, is_active: next }];
    });
    const ok = await setAccess(lawyerId, next);
    if (ok) {
      toast({
        title: next ? "Доступ открыт" : "Доступ отозван",
        description: next
          ? "Юрист видит ваши документы и результаты ИИ-анализа"
          : "Юрист больше не видит документы и ИИ-анализы",
      });
    } else {
      // Откатываем при ошибке
      load();
    }
  };

  const bulkSet = async (next: boolean) => {
    if (lawyers.length === 0) return;
    setBulkBusy(true);
    try {
      const rows = lawyers.map((l) => ({
        client_user_id: user!.id,
        lawyer_id: l.lawyer_id,
        is_active: next,
      }));
      const { error } = await supabase
        .from("client_document_access")
        .upsert(rows, { onConflict: "client_user_id,lawyer_id" });
      if (error) {
        toast({ title: "Не удалось обновить", description: error.message, variant: "destructive" });
        return;
      }
      await load();
      toast({
        title: next ? "Доступ открыт для всех юристов" : "Доступ закрыт у всех юристов",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const isGranted = (lawyerId: string) =>
    grants.find((g) => g.lawyer_id === lawyerId)?.is_active === true;

  const activeCount = lawyers.filter((l) => isGranted(l.lawyer_id)).length;
  const allActive = lawyers.length > 0 && activeCount === lawyers.length;

  if (loading) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаем доступы…
      </CardContent></Card>
    );
  }

  if (lawyers.length === 0) {
    return (
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Доступ юриста к документам
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p className="flex items-start gap-2">
            <Users className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Ни один юрист пока не работает с вашим делом.
          </p>
          <p className="text-xs">
            Если юрист дал вам <strong>код приглашения</strong> — введите его в блоке
            «У меня есть код от юриста» выше. После этого здесь появится переключатель
            доступа к вашим медкартам и ИИ-анализам.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Доступ юриста к документам
            {activeCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {activeCount} из {lawyers.length}
              </Badge>
            )}
          </CardTitle>
          {lawyers.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => bulkSet(!allActive)}
              className="gap-1.5"
            >
              {bulkBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : allActive ? (
                <ShieldOff className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {allActive ? "Закрыть всем" : "Открыть всем"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Краткое объяснение что увидит юрист */}
        <button
          onClick={() => setShowDetails((s) => !s)}
          className="w-full flex items-center gap-2 p-2.5 bg-blue-100/60 dark:bg-blue-950/30 rounded-lg text-sm text-left"
        >
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-blue-900 dark:text-blue-200 flex-1">
            Что увидит юрист, если включить доступ?
          </span>
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-blue-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-blue-500" />
          )}
        </button>
        {showDetails && (
          <div className="rounded-lg border border-blue-200/60 dark:border-blue-900/40 p-3 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Медицинские документы</p>
                <p className="text-muted-foreground">Сканы выписок, заключений, справок и анализов, которые вы загрузили.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Результаты ИИ-анализа этих документов</p>
                <p className="text-muted-foreground">
                  Категория годности по ИИ, краткое заключение, рекомендации — то же, что видите вы у каждого документа.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldOff className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Доступ можно отозвать в один клик</p>
                <p className="text-muted-foreground">
                  Юрист потеряет доступ к документам и ИИ-анализам мгновенно. История сообщений в чате остаётся.
                </p>
              </div>
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          {lawyers.map((l) => {
            const granted = isGranted(l.lawyer_id);
            const prof = profiles[l.lawyer_id];
            const displayName = prof?.full_name || `Юрист (${l.lawyer_id.slice(0, 8)}…)`;
            return (
              <div
                key={l.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center font-semibold text-sm">
                  {prof?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={prof.photo_url} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>

                {/* Name + subtitle */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {prof?.brand_subtitle || `Записаны как «${l.client_name}»`}
                  </p>
                </div>

                {/* Switch + badge */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {granted ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> Открыт
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                      <ShieldOff className="h-3 w-3" /> Закрыт
                    </Badge>
                  )}
                  <Switch
                    checked={granted}
                    onCheckedChange={(v) => toggleOne(l.lawyer_id, v)}
                    aria-label={`Доступ для ${displayName}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ShareWithLawyer;
