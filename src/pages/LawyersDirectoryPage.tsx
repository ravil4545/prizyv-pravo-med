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
import { useToast } from "@/hooks/use-toast";
import { Search, Crown, MapPin, Briefcase, MessageCircle, X, Loader2, ShieldCheck, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface LawyerCard {
  user_id: string;
  full_name: string;
  subscription_tier: string;
  clients_limit: number;
  created_at: string;
  city: string | null;
  region: string | null;
  phone: string | null; // не отображаем публично — только для расчёта верификации
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

  useEffect(() => { loadLawyers(); }, []);

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
      .select("user_id, full_name, subscription_tier, clients_limit, created_at, is_active")
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
      // Проверяем — может уже есть запись от этого клиента к этому юристу
      const { data: existing } = await supabase
        .from("lawyer_clients")
        .select("id")
        .eq("lawyer_id", selectedLawyer.user_id)
        .eq("client_user_id", session.user.id)
        .maybeSingle();

      let lawyerClientId = existing?.id;

      if (!lawyerClientId) {
        // Обезличенное имя — реальные ФИО/телефон/email раскроются юристу
        // только когда клиент сам откроет доступ к документам через профиль
        const anonName = `Клиент #${session.user.id.substring(0, 8)}`;
        const { data: created, error: insertError } = await supabase
          .from("lawyer_clients")
          .insert({
            lawyer_id: selectedLawyer.user_id,
            client_user_id: session.user.id,
            client_name: anonName,
            crm_stage: "initial_contact",
            priority: "high",
          })
          .select()
          .single();
        if (insertError) throw insertError;
        lawyerClientId = created.id;
      }

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
                    className={`border bg-paper p-5 sm:p-6 transition-colors group ${
                      isPro ? "border-gold" : "border-ink/15 hover:border-gold/60"
                    }`}
                  >
                    {/* Top: avatar + name + tier */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`flex-shrink-0 h-14 w-14 border flex items-center justify-center font-serif italic text-xl ${
                        isPro ? "border-gold text-gold-deep" : "border-ink/30 text-ink"
                      }`}>
                        {l.full_name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-lg sm:text-xl text-ink leading-tight">
                          {l.full_name}
                        </h3>
                        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-1">
                          Юрист · Призывное право
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
                      onClick={() => setSelectedLawyer(l)}
                      className="w-full bg-ink text-paper hover:bg-gold hover:text-ink"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Нужна консультация
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

      {/* Request dialog */}
      <Dialog open={!!selectedLawyer} onOpenChange={(open) => { if (!open) { setSelectedLawyer(null); setRequestMessage(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Запрос консультации
            </DialogTitle>
          </DialogHeader>
          {selectedLawyer && (
            <div className="space-y-4">
              <div className="border border-ink/15 bg-paper-deep/40 p-3 flex items-center gap-3">
                <div className="h-10 w-10 border border-ink/30 flex items-center justify-center font-serif italic text-base text-ink">
                  {selectedLawyer.full_name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-medium text-ink">{selectedLawyer.full_name}</p>
                  <p className="text-xs text-ink/60 font-mono tracking-wide uppercase">
                    {TIER_LABELS[selectedLawyer.subscription_tier] || "Юрист"}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink block mb-1.5">
                  Опишите ситуацию <span className="text-ink/50 font-normal">(можно пусто — юрист ответит на типовой запрос)</span>
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Например: получил повестку, у меня диагноз остеохондроз — какие шансы на категорию В?"
                  rows={4}
                  className="w-full px-3 py-2 border border-ink/20 bg-paper focus:outline-none focus:border-gold text-sm resize-none"
                />
                <p className="text-[11px] text-ink/55 mt-1.5">
                  ⚠️ Не указывайте номера телефонов и логины мессенджеров — они автоматически скрываются.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setSelectedLawyer(null); setRequestMessage(""); }} className="flex-1">
                  Отмена
                </Button>
                <Button onClick={requestConsultation} disabled={requesting} className="flex-1 bg-gold text-ink hover:bg-ink hover:text-paper">
                  {requesting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Отправляем...</>
                  ) : (
                    <><MessageCircle className="h-4 w-4 mr-2" /> Отправить</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyersDirectoryPage;
