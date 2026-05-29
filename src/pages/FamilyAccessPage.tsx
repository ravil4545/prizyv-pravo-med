import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  UserPlus,
  Users,
  Copy,
  Check,
  X,
  Mail,
  Calendar,
  Eye,
  Clock3,
  ListChecks,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/LoadingSkeleton";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { withBrandPath } from "@/lib/brandPath";

interface FamilyInvite {
  id: string;
  invitee_email: string;
  viewer_user_id: string | null;
  invite_token: string;
  status: string;
  scopes: Record<string, boolean>;
  relationship: string | null;
  invited_at: string;
  accepted_at: string | null;
  expires_at: string;
}

const SCOPE_LABELS: Record<string, string> = {
  documents: "Медицинские документы",
  ai_analysis: "AI-анализ и шансы по статьям",
  case_events: "События дела (комиссии, суды)",
  chat_with_lawyer: "Переписка с юристом",
};

export default function FamilyAccessPage() {
  const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<FamilyInvite | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const cabinetPath = (target: string) => withBrandPath(location.pathname, target);

  const [form, setForm] = useState({
    email: "",
    relationship: "родитель",
    scopes: {
      documents: true,
      ai_analysis: true,
      case_events: true,
      chat_with_lawyer: false,
    } as Record<string, boolean>,
  });

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate(cabinetPath("/auth"));
      return;
    }
    setUser({ id: session.user.id, email: session.user.email });

    const { data, error } = await supabase
      .from("family_access")
      .select("*")
      .eq("owner_user_id", session.user.id)
      .order("invited_at", { ascending: false });

    if (!error && data) {
      setInvites(data as FamilyInvite[]);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!user) return;
    if (!form.email.trim() || !form.email.includes("@")) {
      toast({ title: "Введите корректный email", variant: "destructive" });
      return;
    }
    if (form.email.toLowerCase() === user.email?.toLowerCase()) {
      toast({ title: "Нельзя пригласить самого себя", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Генерируем токен на клиенте (UUID4)
      const token = crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 8);

      const { error } = await supabase.from("family_access").insert({
        owner_user_id: user.id,
        invitee_email: form.email.trim().toLowerCase(),
        invite_token: token,
        scopes: form.scopes,
        relationship: form.relationship.trim() || null,
        status: "invited",
      });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Уже приглашён",
            description: "Этот email уже добавлен. Отзовите старое приглашение или дождитесь его принятия.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Приглашение создано",
        description: "Скопируйте ссылку из таблицы и отправьте получателю",
      });
      setDialogOpen(false);
      setForm({
        email: "",
        relationship: "родитель",
        scopes: { documents: true, ai_analysis: true, case_events: true, chat_with_lawyer: false },
      });
      void load();
    } catch (err) {
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const { error } = await supabase
      .from("family_access")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", revokeTarget.id);
    if (!error) {
      toast({ title: "Доступ отозван" });
      setRevokeTarget(null);
      void load();
    } else {
      toast({ title: "Ошибка отзыва", variant: "destructive" });
    }
  };

  const handleCopyLink = async (invite: FamilyInvite) => {
    const url = `${window.location.origin}/family/accept/${invite.invite_token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Ссылка скопирована", description: "Отправьте её получателю любым способом" });
  };

  const statusBadge = (status: string) => {
    if (status === "accepted") return <Badge className="bg-success/15 text-success border-success/30">Принято</Badge>;
    if (status === "invited") return <Badge variant="outline" className="border-gold/40 text-gold-deep">Ожидает</Badge>;
    if (status === "revoked") return <Badge variant="outline" className="text-muted-foreground">Отозвано</Badge>;
    if (status === "expired") return <Badge variant="outline" className="text-muted-foreground">Истекло</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <PageLoader message="Загружаем приглашения..." />
        </main>
      </div>
    );
  }

  const acceptedCount = invites.filter((invite) => invite.status === "accepted").length;
  const waitingCount = invites.filter((invite) => invite.status === "invited").length;
  const activeCount = acceptedCount + waitingCount;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(cabinetPath("/dashboard"))} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Назад в кабинет
          </Button>

          <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
            <div>
              <p className="section-number mb-1">Семья</p>
              <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight">
                Семейный контроль дела
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Подключите родителей или близких, которые помогают держать сроки,
                оплачивать консультации и не терять документы. Вы сами выбираете,
                что им видно.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="gap-2 bg-gold-deep hover:bg-gold-deep/90 text-paper"
            >
              <UserPlus className="h-4 w-4" />
              Пригласить
            </Button>
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Card className="border-gold/30 bg-gold/[0.04]">
              <CardContent className="p-4">
                <Clock3 className="mb-3 h-5 w-5 text-gold-deep" />
                <p className="text-sm font-semibold">Сроки без паники</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Семья видит комиссии, суды и обследования, чтобы ничего не пропустить.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <WalletCards className="mb-3 h-5 w-5 text-gold-deep" />
                <p className="text-sm font-semibold">Плательщик понимает ценность</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Близким проще оплатить помощь, когда они видят план и прогресс дела.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-gold-deep" />
                <p className="text-sm font-semibold">Доступ под контролем</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Это просмотр, а не управление. Любой доступ можно отозвать сразу.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6 border-border/60 bg-muted/20">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/15">
                  <ListChecks className="h-5 w-5 text-gold-deep" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Семейный контур</p>
                  <p className="text-xs text-muted-foreground">
                    {activeCount > 0
                      ? `${acceptedCount} принято · ${waitingCount} ожидает`
                      : "Никто из близких пока не подключен"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Добавить близкого
              </Button>
            </CardContent>
          </Card>

          {invites.length === 0 ? (
            <Card className="text-center py-16 border-border/50">
              <CardContent>
                <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-foreground font-medium">Приглашений ещё нет</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Добавьте близких — они увидят план, дедлайны и смогут помочь с оплатой,
                  не вмешиваясь в управление делом
                </p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                  className="gap-2 border-gold/40"
                >
                  <UserPlus className="h-4 w-4" /> Пригласить первого
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {invites.map((inv) => (
                <Card key={inv.id} className="border-border/60 hover:shadow-soft transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-sm text-foreground truncate">
                            {inv.invitee_email}
                          </span>
                          {statusBadge(inv.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inv.relationship && <>{inv.relationship} · </>}
                          приглашён{" "}
                          {format(new Date(inv.invited_at), "d MMM yyyy", { locale: ru })}
                          {inv.status === "invited" && (
                            <>
                              {" · "}действует до{" "}
                              {format(new Date(inv.expires_at), "d MMM", { locale: ru })}
                            </>
                          )}
                          {inv.status === "accepted" && inv.accepted_at && (
                            <>
                              {" · "}принято{" "}
                              {format(new Date(inv.accepted_at), "d MMM", { locale: ru })}
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(inv.scopes || {})
                            .filter(([, v]) => v)
                            .map(([k]) => (
                              <span
                                key={k}
                                className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                              >
                                <Eye className="h-2.5 w-2.5 inline mr-0.5" />
                                {SCOPE_LABELS[k] || k}
                              </span>
                            ))}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {inv.status === "invited" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(inv)}
                            className="gap-1.5"
                          >
                            {copiedId === inv.id ? (
                              <Check className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden sm:inline text-xs">Ссылка</span>
                          </Button>
                        )}
                        {(inv.status === "invited" || inv.status === "accepted") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(inv)}
                            className="text-destructive hover:text-destructive gap-1.5"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline text-xs">Отозвать</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Пригласить близкого</DialogTitle>
            <DialogDescription>
              Получатель увидит только то, что вы разрешите. В любой момент сможете отозвать доступ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-email">Email получателя</Label>
              <Input
                id="invite-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="parent@example.ru"
              />
            </div>
            <div>
              <Label htmlFor="invite-rel">Кем приходится</Label>
              <Input
                id="invite-rel"
                value={form.relationship}
                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                placeholder="родитель, супруг, друг..."
              />
            </div>
            <div className="space-y-2">
              <Label>Что разрешить смотреть</Label>
              {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                >
                  <Checkbox
                    checked={form.scopes[key]}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        scopes: { ...f.scopes, [key]: !!checked },
                      }))
                    }
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              Приглашение действует 30 дней. После принятия доступ остаётся, пока вы его не отзовёте.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleInvite}
              disabled={saving}
              className="bg-gold-deep hover:bg-gold-deep/90 text-paper"
            >
              {saving ? "Создаём..." : "Создать приглашение"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отозвать доступ?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.invitee_email} больше не сможет видеть ваше дело. Это действие можно
              отменить только новым приглашением.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive hover:bg-destructive/90">
              Отозвать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
