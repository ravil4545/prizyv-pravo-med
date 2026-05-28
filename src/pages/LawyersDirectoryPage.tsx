import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Crown, MapPin, Briefcase, MessageCircle, X, Loader2, ShieldCheck, Calendar,
  Phone, Send, Mail, ExternalLink, FileText, Brain, User,
} from "lucide-react";

interface LawyerCard {
  user_id: string;
  full_name: string;
  subscription_tier: string;
  clients_limit: number;
  created_at: string;
  city: string | null;
  region: string | null;
  phone: string | null; // не отображаем публично — только для расчёта верификации
  // Бренд-поля (из lawyer_profiles), которые юрист внёс о себе:
  brand_subtitle: string | null;
  specialization: string | null;
  brand_about: string | null;
  bio: string | null;
  photo_url: string | null;
  brand_phone: string | null;
  brand_telegram: string | null;
  brand_whatsapp: string | null;
  brand_email: string | null;
  slug: string | null;
}

const TIER_LABELS: Record<string, string> = { basic: "Basic", pro: "Pro" };

const LawyersDirectoryPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [lawyers, setLawyers] = useState<LawyerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "pro" | "basic">("all");
  const [selectedLawyer, setSelectedLawyer] = useState<LawyerCard | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  // lawyer_id → доступ открыт. Для текущего клиента — какие юристы уже подключены.
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => { loadLawyers(); loadMyAccess(); }, []);

  // Какие юристы уже имеют доступ к данным текущего клиента (для тумблеров).
  const loadMyAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from("client_document_access")
      .select("lawyer_id, is_active")
      .eq("client_user_id", session.user.id);
    const map: Record<string, boolean> = {};
    (data || []).forEach((r: any) => { map[r.lawyer_id] = !!r.is_active; });
    setAccessMap(map);
  };

  // Тумблер «дать доступ» прямо из каталога/попапа.
  const toggleAccess = async (lawyerId: string, grant: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate(`/auth?next=${encodeURIComponent(`/lawyers?request=${lawyerId}`)}`);
      return;
    }
    setTogglingId(lawyerId);
    // Оптимистично
    setAccessMap((prev) => ({ ...prev, [lawyerId]: grant }));
    try {
      if (grant) {
        const { error } = await supabase.rpc("client_connect_to_lawyer", {
          p_lawyer_id: lawyerId, p_grant_access: true,
        });
        if (error) throw error;
        toast({ title: "Доступ открыт", description: "Юрист видит ваши документы, профиль и ИИ-расшифровки. Отозвать можно здесь же." });
      } else {
        const { error } = await supabase.rpc("client_revoke_lawyer_access", { p_lawyer_id: lawyerId });
        if (error) throw error;
        toast({ title: "Доступ закрыт" });
      }
    } catch (e: any) {
      setAccessMap((prev) => ({ ...prev, [lawyerId]: !grant })); // откат
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  // Авто-открытие карточки и формы запроса по ?request=<lawyer_user_id> (возврат с auth)
  useEffect(() => {
    const requestLawyerId = searchParams.get("request");
    if (requestLawyerId && lawyers.length > 0) {
      const target = lawyers.find((l) => l.user_id === requestLawyerId);
      if (target) setSelectedLawyer(target);
    }
  }, [searchParams, lawyers]);

  const loadLawyers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("lawyer_profiles")
      .select("user_id, full_name, subscription_tier, clients_limit, created_at, is_active, brand_subtitle, specialization, brand_about, bio, photo_url, brand_phone, brand_telegram, brand_whatsapp, brand_email, slug")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const rows = (profiles || []) as any[];
    if (rows.length === 0) {
      setLawyers([]);
      setLoading(false);
      return;
    }

    const userIds = rows.map((r) => r.user_id);
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("id, city, region, phone")
      .in("id", userIds);

    const profileMap = new Map<string, any>();
    (userProfiles || []).forEach((p: any) => profileMap.set(p.id, p));

    const cards: LawyerCard[] = rows.map((r) => {
      const p = profileMap.get(r.user_id) || {};
      return {
        user_id: r.user_id,
        full_name: r.full_name || "Юрист",
        subscription_tier: r.subscription_tier || "basic",
        clients_limit: r.clients_limit || 5,
        created_at: r.created_at,
        city: p.city || null,
        region: p.region || null,
        phone: p.phone || null,
        brand_subtitle: r.brand_subtitle || null,
        specialization: r.specialization || null,
        brand_about: r.brand_about || null,
        bio: r.bio || null,
        photo_url: r.photo_url || null,
        brand_phone: r.brand_phone || null,
        brand_telegram: r.brand_telegram || null,
        brand_whatsapp: r.brand_whatsapp || null,
        brand_email: r.brand_email || null,
        slug: r.slug || null,
      };
    });
    setLawyers(cards);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return lawyers
      .filter((l) => {
        if (tierFilter !== "all" && l.subscription_tier !== tierFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return l.full_name.toLowerCase().includes(q) ||
          (l.city || "").toLowerCase().includes(q) ||
          (l.region || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // Pro юристы выше
        if (a.subscription_tier === "pro" && b.subscription_tier !== "pro") return -1;
        if (a.subscription_tier !== "pro" && b.subscription_tier === "pro") return 1;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [lawyers, tierFilter, search]);

  const requestConsultation = async () => {
    if (!selectedLawyer) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate(`/auth?next=${encodeURIComponent(`/lawyers?request=${selectedLawyer.user_id}`)}`);
      return;
    }

    setRequesting(true);
    try {
      // Связь создаём через RPC (прямой INSERT в lawyer_clients от клиента
      // режет RLS). p_grant_access=false — просто чат, без открытия документов;
      // доступ клиент даёт отдельным тумблером, осознанно.
      const { data: conn, error: connErr } = await supabase.rpc("client_connect_to_lawyer", {
        p_lawyer_id: selectedLawyer.user_id,
        p_grant_access: false,
      });
      if (connErr) throw connErr;
      const row = Array.isArray(conn) ? conn[0] : conn;
      const lawyerClientId = row?.lawyer_client_id;
      if (!lawyerClientId) throw new Error("Не удалось создать диалог");

      // Первое сообщение от клиента
      const messageText = requestMessage.trim() ||
        "Здравствуйте! Прошу проконсультировать по моему вопросу через защищённый чат сайта.";
      await supabase.from("lawyer_chat_messages").insert({
        lawyer_client_id: lawyerClientId,
        sender_id: session.user.id,
        content: messageText,
        message_type: "text",
      });

      toast({
        title: "Запрос отправлен",
        description: "Юрист увидит ваш запрос и ответит в защищённом чате сайта.",
      });

      setSelectedLawyer(null);
      setRequestMessage("");
      // Ведём клиента в его «Сообщения» в кабинете
      navigate("/client/messages");
    } catch (error: any) {
      toast({
        title: "Не удалось отправить запрос",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Юристы по призывному праву | Каталог nepriziv.ru"
        description="Дипломированные юристы по призывному и медицинскому праву. Защищённый чат, прозрачные тарифы, опыт ведения дел в военкомате и суде."
        keywords="юристы по призыву, каталог юристов, юрист призывнику, призывное право"
      />
      <Header />

      <main className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-16 pb-24 md:pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <header className="border-b border-ink/15 pb-6 sm:pb-8 mb-8 sm:mb-10">
            <div className="font-mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-gold mb-3">
              № 07 · Юристы
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-3">
              Каталог юристов
            </h1>
            <p className="text-base sm:text-lg text-ink-soft max-w-2xl leading-relaxed">
              Дипломированные юристы по призывному и медицинскому праву.
              Общение только через защищённый чат сайта — никакого WhatsApp или Telegram до договора.
            </p>
          </header>

          {/* Safety notice */}
          <div className="border-l-2 border-gold bg-paper-deep/40 p-4 mb-8 flex gap-3">
            <ShieldCheck className="h-5 w-5 text-gold-deep flex-shrink-0 mt-0.5" />
            <div className="text-sm text-ink-soft">
              <p className="font-medium text-ink mb-1">Защищённое общение</p>
              <p>
                Все диалоги до подписания договора проходят в чате сайта. Передача номеров,
                адресов и логинов мессенджеров автоматически фильтруется — это защищает обе
                стороны от мошенников и подмены юриста.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-8 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или городу..."
                className="pl-9 h-11 bg-paper border-ink/20 focus-visible:ring-gold"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="inline-flex border border-ink/20 rounded-md overflow-hidden h-11 self-start sm:self-auto">
              {(["all", "pro", "basic"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`px-4 py-2 text-xs font-mono tracking-[0.15em] uppercase transition-colors ${
                    tierFilter === t ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-deep"
                  }`}
                >
                  {t === "all" ? "Все" : t === "pro" ? "Pro" : "Basic"}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full rounded-none" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-ink/20">
              <Briefcase className="h-10 w-10 text-ink/30 mx-auto mb-3" />
              <p className="font-serif text-xl text-ink mb-2">Юристы не найдены</p>
              <p className="text-sm text-ink-soft">
                {search || tierFilter !== "all" ? "Попробуйте другой запрос" : "Скоро здесь появятся юристы — Александра уже подключена."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filtered.map((l) => {
                const isPro = l.subscription_tier === "pro";
                const tenureYears = Math.max(0, Math.floor((Date.now() - new Date(l.created_at).getTime()) / (365 * 24 * 60 * 60 * 1000)));
                return (
                  <article
                    key={l.user_id}
                    onClick={() => setSelectedLawyer(l)}
                    className={`border bg-paper p-5 sm:p-6 transition-colors group cursor-pointer ${
                      isPro ? "border-gold hover:bg-gold/[0.03]" : "border-ink/15 hover:border-gold/60 hover:bg-paper-deep/20"
                    }`}
                  >
                    {/* Top: avatar + name + tier */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`flex-shrink-0 h-14 w-14 border flex items-center justify-center font-serif italic text-xl overflow-hidden ${
                        isPro ? "border-gold text-gold-deep" : "border-ink/30 text-ink"
                      }`}>
                        {l.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.photo_url} alt={l.full_name} className="h-full w-full object-cover" />
                        ) : (
                          l.full_name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-lg sm:text-xl text-ink leading-tight">
                          {l.full_name}
                        </h3>
                        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-1 truncate">
                          {l.brand_subtitle || l.specialization || "Юрист · Призывное право"}
                        </p>
                      </div>
                      {isPro && (
                        <Badge className="bg-gold/15 text-gold-deep border-gold/40 text-[10px] uppercase tracking-wider whitespace-nowrap">
                          <Crown className="h-3 w-3 mr-1" /> Pro
                        </Badge>
                      )}
                    </div>

                    {/* Meta */}
                    <dl className="grid grid-cols-2 gap-3 mb-5 text-sm">
                      {(l.city || l.region) && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3.5 w-3.5 text-ink/50 mt-0.5 flex-shrink-0" />
                          <div>
                            <dt className="text-[10px] tracking-[0.15em] uppercase font-mono text-ink/50">Локация</dt>
                            <dd className="text-ink">{l.city}{l.city && l.region ? ", " : ""}{l.region}</dd>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Calendar className="h-3.5 w-3.5 text-ink/50 mt-0.5 flex-shrink-0" />
                        <div>
                          <dt className="text-[10px] tracking-[0.15em] uppercase font-mono text-ink/50">На сайте</dt>
                          <dd className="text-ink">
                            {tenureYears > 0 ? `${tenureYears} ${tenureYears === 1 ? "год" : tenureYears < 5 ? "года" : "лет"}` : "новый юрист"}
                          </dd>
                        </div>
                      </div>
                    </dl>

                    {/* CTA */}
                    <Button
                      onClick={(e) => { e.stopPropagation(); setSelectedLawyer(l); }}
                      className="w-full bg-ink text-paper hover:bg-gold hover:text-ink"
                    >
                      {accessMap[l.user_id] ? (
                        <><ShieldCheck className="h-4 w-4 mr-2" /> Доступ открыт · подробнее</>
                      ) : (
                        <><Briefcase className="h-4 w-4 mr-2" /> Открыть визитку</>
                      )}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}

          {/* Bottom CTA — стать юристом на платформе */}
          <div className="mt-14 border-y border-ink/15 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
            <div className="sm:col-span-2">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
                Юристам
              </div>
              <h2 className="font-serif text-2xl text-ink mb-1">Хотите принимать клиентов через nepriziv.ru?</h2>
              <p className="text-sm text-ink-soft">
                CRM, защищённый чат, шаблоны, ИИ-помощник по делу. Тариф Basic — 5 клиентов, Pro — безлимит.
              </p>
            </div>
            <Link
              to="/lawyer"
              className="inline-flex items-center justify-between gap-2 px-5 py-3 bg-gold text-ink font-semibold hover:bg-ink hover:text-paper transition-colors"
            >
              Кабинет юриста
              <Briefcase className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>

      <Footer />

      {/* Визитка юриста + тумблер доступа + запрос консультации */}
      <Dialog open={!!selectedLawyer} onOpenChange={(open) => { if (!open) { setSelectedLawyer(null); setRequestMessage(""); } }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {selectedLawyer && (() => {
            const l = selectedLawyer;
            const about = l.brand_about || l.bio;
            const subtitle = l.brand_subtitle || l.specialization || "Юрист по призывному праву";
            const tg = l.brand_telegram?.replace(/^@/, "");
            const wa = l.brand_whatsapp?.replace(/\D/g, "");
            const hasContacts = l.brand_phone || tg || wa || l.brand_email;
            const granted = !!accessMap[l.user_id];
            const isPro = l.subscription_tier === "pro";
            return (
              <>
                <DialogHeader className="sr-only">
                  <DialogTitle>{l.full_name}</DialogTitle>
                </DialogHeader>

                {/* Шапка-визитка */}
                <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-gold/10 to-paper-deep/30 border-b border-ink/10">
                  <div className="h-16 w-16 rounded-full overflow-hidden border border-ink/20 flex items-center justify-center font-serif italic text-2xl text-ink bg-paper flex-shrink-0">
                    {l.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.photo_url} alt={l.full_name} className="h-full w-full object-cover" />
                    ) : (
                      l.full_name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-xl text-ink leading-tight">{l.full_name}</h3>
                      {isPro && (
                        <Badge className="bg-gold/15 text-gold-deep border-gold/40 text-[10px] uppercase">
                          <Crown className="h-3 w-3 mr-1" /> Pro
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft mt-1">{subtitle}</p>
                    {(l.city || l.region) && (
                      <p className="text-xs text-ink/50 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {l.city}{l.city && l.region ? ", " : ""}{l.region}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* О себе */}
                  {about && (
                    <p className="text-sm text-ink-soft leading-relaxed">{about}</p>
                  )}

                  {/* Контакты — показываем то, что юрист внёс в бренд */}
                  {hasContacts && (
                    <div className="space-y-1.5">
                      {l.brand_phone && (
                        <a href={`tel:${l.brand_phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm text-ink-soft hover:text-gold-deep">
                          <Phone className="h-3.5 w-3.5 text-ink/40" /> {l.brand_phone}
                        </a>
                      )}
                      {tg && (
                        <a href={`https://t.me/${tg}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-ink-soft hover:text-sky-600">
                          <Send className="h-3.5 w-3.5 text-ink/40" /> @{tg}
                        </a>
                      )}
                      {wa && (
                        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-ink-soft hover:text-emerald-600">
                          <MessageCircle className="h-3.5 w-3.5 text-ink/40" /> WhatsApp
                        </a>
                      )}
                      {l.brand_email && (
                        <a href={`mailto:${l.brand_email}`} className="flex items-center gap-2 text-sm text-ink-soft hover:text-gold-deep break-all">
                          <Mail className="h-3.5 w-3.5 text-ink/40" /> {l.brand_email}
                        </a>
                      )}
                    </div>
                  )}

                  {l.slug && (
                    <a href={`/u/${l.slug}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-gold-deep hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Открыть страницу юриста
                    </a>
                  )}

                  {/* Тумблер доступа — главный CTA */}
                  <div className={`rounded-lg border p-3.5 ${granted ? "border-emerald-300 bg-emerald-50/60" : "border-ink/15 bg-paper-deep/30"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink flex items-center gap-1.5">
                          <ShieldCheck className={`h-4 w-4 ${granted ? "text-emerald-600" : "text-ink/40"}`} />
                          {granted ? "Доступ открыт" : "Дать доступ юристу"}
                        </p>
                        <p className="text-xs text-ink/55 mt-0.5">
                          Документы, профиль и все ИИ-расшифровки. Отозвать можно в любой момент.
                        </p>
                      </div>
                      <Switch
                        checked={granted}
                        disabled={togglingId === l.user_id}
                        onCheckedChange={(v) => toggleAccess(l.user_id, v)}
                        aria-label="Доступ юриста к данным"
                      />
                    </div>
                    {/* Что откроется */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"><FileText className="h-3 w-3" /> Документы</span>
                      <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"><Brain className="h-3 w-3" /> ИИ-расшифровки</span>
                      <span className="text-[10px] gap-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"><User className="h-3 w-3" /> Профиль</span>
                    </div>
                  </div>

                  {/* Написать в чат */}
                  <Button
                    onClick={requestConsultation}
                    disabled={requesting}
                    variant="outline"
                    className="w-full"
                  >
                    {requesting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Отправляем...</>
                    ) : (
                      <><MessageCircle className="h-4 w-4 mr-2" /> Написать в чат</>
                    )}
                  </Button>
                  <p className="text-[11px] text-ink/50 text-center">
                    Общение до договора — только в защищённом чате сайта.
                  </p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyersDirectoryPage;
