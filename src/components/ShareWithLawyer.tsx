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
  Shield, FileText, Brain, Users, User, Info, ShieldOff, ShieldCheck,
  ChevronDown, ChevronUp, Loader2, MoreVertical, UserMinus, AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Phone, Send, MessageCircle, Mail, ExternalLink } from "lucide-react";

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
  specialization: string | null;
  brand_about: string | null;
  bio: string | null;
  brand_phone: string | null;
  brand_telegram: string | null;
  brand_whatsapp: string | null;
  brand_email: string | null;
  slug: string | null;
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
  // ID карточки lawyer_clients, по которой клиент собирается отвязаться.
  // null = диалог закрыт. Используем AlertDialog с явным подтверждением, потому
  // что действие необратимое со стороны клиента (юрист может пригласить заново
  // только новым кодом).
  const [unlinkTarget, setUnlinkTarget] = useState<LawyerEntry | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const unlinkFromLawyer = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    const { error } = await supabase.rpc("client_unlink_from_lawyer", {
      p_lawyer_client_id: unlinkTarget.id,
    });
    setUnlinking(false);
    if (error) {
      toast({ title: "Не удалось отвязаться", description: error.message, variant: "destructive" });
      return;
    }
    setUnlinkTarget(null);
    await load();
    toast({
      title: "Вы отвязались от юриста",
      description: "Юрист потерял доступ к вашим документам. История чата у юриста сохранена.",
    });
  };

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
        .select("user_id, full_name, photo_url, brand_subtitle, specialization, brand_about, bio, brand_phone, brand_telegram, brand_whatsapp, brand_email, slug")
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
          ? "Юрист видит ваши документы, профиль и все ИИ-расшифровки"
          : "Юрист больше не видит документы, профиль и ИИ-расшифровки",
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

  // Пока грузим — ничего не показываем (не мигаем спиннером в кабинете).
  if (loading) return null;

  // Нет юристов — блок просто не отображается. Подключиться к юристу клиент
  // может в каталоге /lawyers (плашка → визитка → тумблер доступа), поэтому
  // пустая заглушка тут не нужна.
  if (lawyers.length === 0) return null;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Доступ юриста к данным
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
                <p className="font-medium">Все ИИ-расшифровки и своды</p>
                <p className="text-muted-foreground">
                  Категория годности по ИИ, заключения и рекомендации по каждому документу, а также сводный анализ дела.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Профиль</p>
                <p className="text-muted-foreground">
                  ФИО, контакты и адрес из вашего профиля — чтобы юрист корректно заполнял документы и досье.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldOff className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Доступ можно отозвать в один клик</p>
                <p className="text-muted-foreground">
                  Юрист мгновенно потеряет доступ к документам, ИИ-анализам и профилю. История сообщений в чате остаётся.
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
                {/* Интерактивная плашка: avatar + имя + subtitle.
                    Клик открывает компактную визитку юриста (Popover). */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg hover:bg-muted/50 -m-1 p-1 transition-colors"
                      title="Открыть визитку юриста"
                    >
                      <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center font-semibold text-sm">
                        {prof?.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prof.photo_url} alt={displayName} className="h-full w-full object-cover" />
                        ) : (
                          displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate flex items-center gap-1">
                          {displayName}
                          <ChevronDown className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {prof?.brand_subtitle || prof?.specialization || `Записаны как «${l.client_name}»`}
                        </p>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0 overflow-hidden">
                    {(() => {
                      const about = prof?.brand_about || prof?.bio;
                      const tg = prof?.brand_telegram?.replace(/^@/, "");
                      const wa = prof?.brand_whatsapp?.replace(/\D/g, "");
                      const hasContacts = prof?.brand_phone || tg || wa || prof?.brand_email;
                      return (
                        <>
                          {/* Шапка визитки */}
                          <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-primary/5 to-violet-500/5 border-b">
                            <div className="h-14 w-14 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-lg">
                              {prof?.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={prof.photo_url} alt={displayName} className="h-full w-full object-cover" />
                              ) : (
                                displayName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm leading-tight">{displayName}</p>
                              {(prof?.brand_subtitle || prof?.specialization) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {prof?.brand_subtitle || prof?.specialization}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="p-4 space-y-3">
                            {/* О себе */}
                            {about && (
                              <p className="text-xs text-foreground/80 leading-relaxed line-clamp-4">
                                {about}
                              </p>
                            )}

                            {/* Контакты */}
                            {hasContacts && (
                              <div className="space-y-1.5">
                                {prof?.brand_phone && (
                                  <a href={`tel:${prof.brand_phone.replace(/[^\d+]/g, "")}`}
                                    className="flex items-center gap-2 text-xs text-foreground/80 hover:text-primary">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    {prof.brand_phone}
                                  </a>
                                )}
                                {tg && (
                                  <a href={`https://t.me/${tg}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-xs text-foreground/80 hover:text-sky-500">
                                    <Send className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    @{tg}
                                  </a>
                                )}
                                {wa && (
                                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-xs text-foreground/80 hover:text-emerald-500">
                                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    WhatsApp
                                  </a>
                                )}
                                {prof?.brand_email && (
                                  <a href={`mailto:${prof.brand_email}`}
                                    className="flex items-center gap-2 text-xs text-foreground/80 hover:text-primary break-all">
                                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    {prof.brand_email}
                                  </a>
                                )}
                              </div>
                            )}

                            {!about && !hasContacts && (
                              <p className="text-xs text-muted-foreground italic">
                                Юрист пока не заполнил подробную информацию о себе.
                              </p>
                            )}

                            {/* Ссылка на полную страницу юриста */}
                            {prof?.slug && (
                              <a
                                href={`/u/${prof.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline pt-1"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Открыть страницу юриста
                              </a>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </PopoverContent>
                </Popover>

                {/* Switch + badge + меню действий */}
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
                  {/* Меню — отвязка целиком (разные сценарии: только закрыть
                      доступ — switch; полностью разорвать связь — здесь). */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Действия"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={() => toggleOne(l.lawyer_id, !granted)}
                      >
                        {granted ? (
                          <>
                            <ShieldOff className="h-4 w-4 mr-2 text-muted-foreground" />
                            Закрыть доступ к документам
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4 mr-2 text-emerald-600" />
                            Открыть доступ к документам
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setUnlinkTarget(l)}
                        className="text-destructive focus:text-destructive"
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        Отвязаться от юриста
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Подтверждение отвязки — действие необратимое, спрашиваем явно. */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => { if (!open) setUnlinkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Отвязаться от юриста?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  После отвязки:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Юрист потеряет доступ к вашим медицинским документам и ИИ-анализам</li>
                  <li>Карточка с историей дела останется у юриста (но без ваших новых документов)</li>
                  <li>Чтобы снова работать с этим юристом — нужен новый код приглашения</li>
                </ul>
                <p className="pt-2">
                  Если вы хотите только временно скрыть документы, проще <strong>«Закрыть доступ»</strong>
                  переключателем — связь сохранится.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); unlinkFromLawyer(); }}
              disabled={unlinking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserMinus className="h-4 w-4 mr-2" />}
              Отвязаться
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ShareWithLawyer;
