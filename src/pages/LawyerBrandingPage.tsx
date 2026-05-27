import { useEffect, useRef, useState } from "react";
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
import { Briefcase, ArrowLeft, Save, Loader2, Link as LinkIcon, Copy, Check, ExternalLink, QrCode, Eye, AlertCircle, Upload, X } from "lucide-react";
import { slugifyRu } from "@/lib/slug";
import BrandedAvatar from "@/components/BrandedAvatar";

const BRAND_BUCKET = "lawyer-brand-assets";
const PRESET_ACCENT_COLORS = ["#0F766E", "#1D4ED8", "#7C3AED", "#DB2777", "#DC2626", "#EA580C", "#CA8A04", "#16A34A"];

type BrandTemplate = "classic" | "editorial" | "minimal";

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
  brand_template: BrandTemplate;
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
  brand_template: "classic",
};

const TEMPLATE_OPTIONS: Array<{ value: BrandTemplate; title: string; description: string; preview: string }> = [
  {
    value: "classic",
    title: "Карточка",
    description: "Тёплая визитка с фото и контактами в один экран — идеально для звонков от клиентов",
    preview: "bg-gradient-to-br from-amber-100 to-stone-100",
  },
  {
    value: "editorial",
    title: "Газетный",
    description: "Сдержанный editorial-разворот с серифной типографикой — стиль nepriziv.ru",
    preview: "bg-paper",
  },
  {
    value: "minimal",
    title: "Минимал",
    description: "Большая чёрно-белая типографика и одна крупная кнопка — современный лук",
    preview: "bg-white",
  },
];

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Загрузка фото юриста в bucket lawyer-brand-assets/<user_id>/photo-<ts>.<ext>.
  // RLS гарантирует что юрист может писать только в свою папку.
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Файл больше 5 МБ", description: "Выберите изображение поменьше.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Только изображения", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/photo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BRAND_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (upErr) {
      // Если bucket не существует — даём осмысленный месседж админу
      const isMissingBucket = /not found|does not exist/i.test(upErr.message);
      toast({
        title: isMissingBucket ? "Bucket не создан" : "Не удалось загрузить",
        description: isMissingBucket
          ? "Админу: примените миграцию 20260527001000_lawyer_brand_assets_bucket.sql"
          : upErr.message,
        variant: "destructive",
      });
      setUploadingPhoto(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from(BRAND_BUCKET).getPublicUrl(path);
    setForm((f) => ({ ...f, photo_url: publicUrl }));
    setUploadingPhoto(false);
    toast({ title: "Фото загружено", description: "Не забудьте сохранить бренд." });
  };

  const clearPhoto = () => {
    setForm((f) => ({ ...f, photo_url: "" }));
  };

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
        brand_template: (row.brand_template as BrandTemplate) || "classic",
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
      // ВАЖНО: гарантируем is_active=true. Без этого запись не попадает
      // в публичный каталог /lawyers и не подхватывается BrandingContext
      // на /u/<slug> (там фильтр is_active = true).
      is_active: true,
      brand_subtitle: form.brand_subtitle || null,
      brand_about: form.brand_about || null,
      photo_url: form.photo_url || null,
      brand_phone: form.brand_phone || null,
      brand_telegram: form.brand_telegram?.replace(/^@/, "") || null,
      brand_whatsapp: form.brand_whatsapp?.replace(/\D/g, "") || null,
      brand_email: form.brand_email || null,
      accent_color: form.accent_color || null,
      brand_template: form.brand_template || "classic",
    };
    // upsert: если записи нет — создаст, если есть — обновит. Это устойчиво
    // к тому, что юрист попал на /lawyer/branding без существующей строки
    // (например, профиль создавался ранее в /admin/users).
    const { error } = await supabase
      .from("lawyer_profiles")
      .upsert(payload as any, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      // Распознаём типовые ошибки PostgREST/Postgres и даём осмысленные сообщения
      const msg = error.message || "";
      const code = (error as any).code || "";
      const isSchemaError = /column .+ does not exist|PGRST204|schema cache/i.test(msg);
      const isPermissionError = /permission denied|RLS|row-level security/i.test(msg) || code === "42501";
      const isUniqueError = /unique|duplicate/i.test(msg) || code === "23505";
      const isConstraintError = /check constraint/i.test(msg) || code === "23514";

      let title = "Не удалось сохранить";
      let description = msg;
      if (isSchemaError) {
        title = "База ещё не обновлена";
        description = "Поля бренда не созданы. Админу: примените миграцию 20260526233000_lawyer_branding.sql в Supabase SQL Editor.";
      } else if (isUniqueError && msg.toLowerCase().includes("slug")) {
        title = "Адрес занят";
        description = `Slug «${form.slug}» уже используется другим юристом — выберите другой.`;
      } else if (isConstraintError && msg.toLowerCase().includes("slug")) {
        title = "Неверный формат slug";
        description = "Только латиница, цифры и дефис; 3-40 символов; не начинается и не заканчивается дефисом.";
      } else if (isPermissionError) {
        title = "Нет прав на запись";
        description = "RLS-политика не разрешает сохранение. Админу: примените миграцию 20260526230000_lawyer_profiles_public_and_admin.sql.";
      } else {
        description = `${msg}${(error as any).hint ? "  ·  " + (error as any).hint : ""}${code ? "  [" + code + "]" : ""}`;
      }
      toast({ title, description, variant: "destructive" });
      console.error("Branding save error:", { error, code, hint: (error as any).hint, details: (error as any).details });
      return;
    }
    toast({
      title: "Сохранено",
      description: form.slug
        ? `Бренд активен по адресу /u/${form.slug}`
        : "Бренд обновлён",
    });
    // Перечитываем чтобы превью отражало то что в БД и slug закрепился
    loadBranding();
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
                  <Label>Фото</Label>
                  <div className="flex items-start gap-3 mt-1.5">
                    <div className="flex-shrink-0">
                      <BrandedAvatar
                        src={form.photo_url}
                        name={form.full_name || "Юрист"}
                        shape="round"
                        className="h-20 w-20 border"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={uploadingPhoto}
                        >
                          {uploadingPhoto ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {form.photo_url ? "Заменить" : "Загрузить с устройства"}
                        </Button>
                        {form.photo_url && (
                          <Button type="button" variant="ghost" size="sm" onClick={clearPhoto}>
                            <X className="h-3.5 w-3.5 mr-1.5" /> Убрать
                          </Button>
                        )}
                      </div>
                      <Input
                        id="photo"
                        value={form.photo_url}
                        onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))}
                        placeholder="…или вставьте URL https://..."
                        className="text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Размер до 5 МБ. Фото клиент видит на вашей brand-странице /u/&lt;адрес&gt;.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Label>Акцентный цвет</Label>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <input
                      type="color"
                      value={form.accent_color || "#0F766E"}
                      onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                      className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0"
                      aria-label="Выбрать акцентный цвет"
                    />
                    <Input
                      value={form.accent_color}
                      onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                      placeholder="#0F766E"
                      className="w-32 font-mono text-xs"
                    />
                    {form.accent_color && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, accent_color: "" }))}>
                        <X className="h-3.5 w-3.5 mr-1" /> Сбросить
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {PRESET_ACCENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, accent_color: c }))}
                        className="h-6 w-6 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                        title={c}
                        aria-label={`Выбрать ${c}`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Используется для акцентов на вашей brand-странице (кнопки, ссылки).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Шаблон визуала лендинга */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Шаблон лендинга</CardTitle>
                <CardDescription>
                  Как выглядит ваша персональная страница /u/{form.slug || "<адрес>"} для клиента.
                  Можно поменять в любой момент — данные не теряются.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-3">
                {TEMPLATE_OPTIONS.map((opt) => {
                  const active = form.brand_template === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, brand_template: opt.value }))}
                      className={`text-left rounded-xl border-2 p-3 transition-all ${
                        active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`${opt.preview} h-20 rounded-lg border border-stone-200 mb-2 flex items-center justify-center text-[10px] uppercase tracking-widest text-stone-500`}>
                        {opt.title}
                      </div>
                      <p className="font-semibold text-sm">{opt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{opt.description}</p>
                    </button>
                  );
                })}
              </CardContent>
              {form.slug && (
                <CardContent className="pt-0">
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <a href={`/u/${form.slug}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Посмотреть, как видит клиент
                    </a>
                  </Button>
                </CardContent>
              )}
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
