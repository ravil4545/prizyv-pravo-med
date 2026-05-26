import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, ArrowLeft, Save, Loader2, Link as LinkIcon, Copy, Check, ExternalLink, QrCode, Eye, AlertCircle } from "lucide-react";
import { slugifyRu } from "@/lib/slug";
import BrandedAvatar from "@/components/BrandedAvatar";

interface BrandingForm {
  slug: string;
  full_name: string;
  brand_subtitle: string;
  brand_about: string;
  photo_url: string;
  brand_phone: string;
  brand_telegram: string;
  brand_whatsapp: string;
  brand_email: string;
  accent_color: string;
}

const DEFAULT_FORM: BrandingForm = {
  slug: "",
  full_name: "",
  brand_subtitle: "Юрист по призывному и медицинскому праву",
  brand_about: "",
  photo_url: "",
  brand_phone: "",
  brand_telegram: "",
  brand_whatsapp: "",
  brand_email: "",
  accent_color: "",
};

const SITE_ORIGIN = (typeof window !== "undefined") ? window.location.origin : "https://nepriziv.ru";
const PUBLIC_BASE = "https://nepriziv.ru";

const LawyerBrandingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, isLawyer } = useLawyerProfile();
  const { toast } = useToast();

  const [form, setForm] = useState<BrandingForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!user) { navigate("/auth?next=/lawyer/branding", { replace: true }); return; }
    if (!isLawyer) { navigate("/dashboard", { replace: true }); return; }
    loadBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileLoading, isLawyer]);

  const loadBranding = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const row = data as any;
      setForm({
        slug: row.slug || "",
        full_name: row.full_name || profile?.full_name || "",
        brand_subtitle: row.brand_subtitle || DEFAULT_FORM.brand_subtitle,
        brand_about: row.brand_about || "",
        photo_url: row.photo_url || "",
        brand_phone: row.brand_phone || "",
        brand_telegram: row.brand_telegram || "",
        brand_whatsapp: row.brand_whatsapp || "",
        brand_email: row.brand_email || "",
        accent_color: row.accent_color || "",
      });
      if (row.slug) setSlugTouched(true);
    }
    setLoading(false);
  };

  // Авто-slug из ФИО (пока юрист сам не редактировал)
  useEffect(() => {
    if (!slugTouched && form.full_name) {
      setForm((f) => ({ ...f, slug: slugifyRu(form.full_name).substring(0, 32) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.full_name]);

  const validateSlug = (value: string): string | null => {
    if (!value) return null; // пустой допустим (юрист без публичной страницы)
    if (value.length < 3) return "Минимум 3 символа";
    if (value.length > 40) return "Максимум 40 символов";
    if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/.test(value)) {
      return "Только латиница, цифры, дефис; начинается и заканчивается буквой/цифрой";
    }
    return null;
  };

  const handleSlugChange = (raw: string) => {
    const cleaned = raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: cleaned }));
    setSlugError(validateSlug(cleaned));
  };

  const handleSave = async () => {
    if (!user) return;
    const err = validateSlug(form.slug);
    if (err) {
      setSlugError(err);
      toast({ title: "Проверьте slug", description: err, variant: "destructive" });
      return;
    }
    if (form.slug) {
      const { data: clash } = await supabase
        .from("lawyer_profiles")
        .select("user_id")
        .eq("slug", form.slug)
        .neq("user_id", user.id)
        .maybeSingle();
      if (clash) {
        setSlugError("Такой адрес уже занят другим юристом");
        toast({ title: "Адрес занят", description: "Выберите другой slug", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    // full_name в lawyer_profiles в части окружений NOT NULL — подстраховываемся
    // непустым fallback'ом, чтобы upsert не падал при первичном сохранении.
    const safeName = form.full_name?.trim() || profile?.full_name?.trim() || user.email?.split("@")[0] || "Юрист";
    const payload = {
      user_id: user.id,
      slug: form.slug || null,
      full_name: safeName,
      brand_subtitle: form.brand_subtitle || null,
      brand_about: form.brand_about || null,
      photo_url: form.photo_url || null,
      brand_phone: form.brand_phone || null,
      brand_telegram: form.brand_telegram?.replace(/^@/, "") || null,
      brand_whatsapp: form.brand_whatsapp?.replace(/\D/g, "") || null,
      brand_email: form.brand_email || null,
      accent_color: form.accent_color || null,
    };
    // upsert: если записи нет — создаст, если есть — обновит. Это устойчиво
    // к тому, что юрист попал на /lawyer/branding без существующей строки
    // (например, профиль создавался ранее в /admin/users).
    const { error } = await supabase
      .from("lawyer_profiles")
      .upsert(payload as any, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      // Самый частый случай: миграция полей бренда ещё не применена в БД —
      // PostgREST возвращает PGRST204 «column ... does not exist».
      const isSchemaError = /column .+ does not exist|PGRST204|schema cache/i.test(error.message);
      toast({
        title: isSchemaError ? "База ещё не обновлена" : "Не удалось сохранить",
        description: isSchemaError
          ? "Поля бренда не созданы. Админу: примени миграцию 20260526233000_lawyer_branding.sql в Supabase SQL Editor."
          : error.message,
        variant: "destructive",
      });
      console.error("Branding save error:", error);
      return;
    }
    toast({ title: "Сохранено", description: "Бренд обновлён" });
  };

  const brandUrl = form.slug ? `${PUBLIC_BASE}/u/${form.slug}` : "";
  const previewUrl = form.slug ? `${SITE_ORIGIN}/u/${form.slug}` : "";
  const qrUrl = brandUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(brandUrl)}`
    : "";

  const copyLink = async () => {
    if (!brandUrl) return;
    try {
      await navigator.clipboard.writeText(brandUrl);
      setCopied(true);
      toast({ title: "Ссылка скопирована" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/lawyer"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <Briefcase className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Мой бренд</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Настройте свою «копию сайта» — клиенты увидят только вас, не nepriziv.ru
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Адрес */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><LinkIcon className="h-4 w-4" /> Адрес вашего приложения</CardTitle>
                <CardDescription>
                  По этому адресу клиент откроет сайт как «ваше приложение». Можете оставить пустым, если не нужно.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="slug">URL-адрес</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm text-muted-foreground font-mono">nepriziv.ru/u/</span>
                    <Input
                      id="slug"
                      value={form.slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      placeholder="vazhanina"
                      className={slugError ? "border-destructive" : ""}
                    />
                  </div>
                  {slugError && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {slugError}
                    </p>
                  )}
                  {!slugError && form.slug && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Полная ссылка: <span className="font-mono text-foreground">{brandUrl}</span>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Личный бренд */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Личный бренд</CardTitle>
                <CardDescription>Имя, фото и описание, которые увидит клиент</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="full_name">Полное ФИО</Label>
                  <Input id="full_name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Иванов Иван Иванович" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="subtitle">Подпись (специализация)</Label>
                  <Input id="subtitle" value={form.brand_subtitle} onChange={(e) => setForm((f) => ({ ...f, brand_subtitle: e.target.value }))} placeholder="Юрист по призывному праву" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="about">О себе</Label>
                  <Textarea id="about" rows={4} value={form.brand_about} onChange={(e) => setForm((f) => ({ ...f, brand_about: e.target.value }))} placeholder="Краткое описание для главной страницы вашего приложения" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="photo">URL фото (HTTPS)</Label>
                  <Input id="photo" value={form.photo_url} onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))} placeholder="https://..." />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Можно ссылку из Google Drive (доступ по ссылке) или другого хранилища. Загрузка с устройства добавится позже.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Контакты */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Контакты</CardTitle>
                <CardDescription>Эти кнопки будут показаны клиенту в вашем приложении</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div><Label>Телефон</Label><Input value={form.brand_phone} onChange={(e) => setForm((f) => ({ ...f, brand_phone: e.target.value }))} placeholder="+7 925 350-05-33" /></div>
                <div><Label>Email</Label><Input type="email" value={form.brand_email} onChange={(e) => setForm((f) => ({ ...f, brand_email: e.target.value }))} placeholder="lawyer@example.com" /></div>
                <div>
                  <Label>Telegram (username)</Label>
                  <Input value={form.brand_telegram} onChange={(e) => setForm((f) => ({ ...f, brand_telegram: e.target.value }))} placeholder="username (без @)" />
                </div>
                <div>
                  <Label>WhatsApp (только цифры)</Label>
                  <Input value={form.brand_whatsapp} onChange={(e) => setForm((f) => ({ ...f, brand_whatsapp: e.target.value }))} placeholder="79253500533" />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2 justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Сохранить бренд
              </Button>
            </div>
          </div>

          {/* Preview + QR */}
          <aside className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Превью карточки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-ink/15 bg-paper p-4">
                  <div className="flex items-start gap-3">
                    <BrandedAvatar
                      src={form.photo_url}
                      name={form.full_name || "Юрист"}
                      shape="round"
                      className="h-12 w-12 border border-ink/30 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-serif text-base text-ink leading-tight">
                        {form.full_name || "Ваше ФИО — обновится после сохранения"}
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-1">
                        {form.brand_subtitle || "Юрист по призывному праву"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                    {form.brand_about
                      || "Краткое описание появится здесь — заполните блок «О себе» выше."}
                  </p>
                  {form.brand_phone && (
                    <p className="text-xs text-ink-soft mt-2 font-mono">📞 {form.brand_phone}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* QR */}
            {form.slug && !slugError ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" /> Ссылка и QR-код</CardTitle>
                  <CardDescription>Отправьте клиенту любым способом — он откроет ваше приложение</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="border bg-white p-3 flex items-center justify-center">
                    {qrUrl && <img src={qrUrl} alt="QR-код" className="w-44 h-44" />}
                  </div>
                  <div className="text-xs font-mono break-all bg-muted/40 p-2 rounded">{brandUrl}</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={copyLink}>
                      {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                      {copied ? "Скопировано" : "Скопировать"}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Открыть
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                  Задайте URL-адрес слева, чтобы получить ссылку и QR-код для клиента.
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LawyerBrandingPage;
