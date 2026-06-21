/* eslint-disable @typescript-eslint/no-explicit-any -- профиль/клиент из БД читаются динамически без сгенерированных типов */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ShieldCheck, ShieldOff, ExternalLink, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import TemplatesWorkspace, { mapMedicalDocs, type DocItem } from "@/components/TemplatesWorkspace";

interface ClientData {
  profile: Record<string, any> | null;
  docs: DocItem[];
  email: string | null;
  name: string;
  hasAccess: boolean;
}

// Шаблоны в кабинете юриста: тот же движок, что у клиента (TemplatesWorkspace),
// но поля заполняются данными ВЫБРАННОГО клиента. Открывается из карточки дела
// (/lawyer/templates?client=<lawyer_client_id>) либо с выбором клиента здесь.
const LawyerTemplatesPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isLawyer, loading: profileLoading } = useLawyerProfile();
  const [params, setParams] = useSearchParams();
  const clientId = params.get("client");

  const [clients, setClients] = useState<{ id: string; client_name: string }[]>([]);
  const [data, setData] = useState<ClientData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (profileLoading || authLoading) return;
    if (!user) { navigate("/auth?next=/lawyer/templates", { replace: true }); return; }
    if (!isLawyer) { navigate("/dashboard", { replace: true }); return; }
  }, [user, authLoading, profileLoading, isLawyer, navigate]);

  // Список клиентов для селектора.
  useEffect(() => {
    if (!user || !isLawyer) return;
    (async () => {
      const { data: rows } = await supabase
        .from("lawyer_clients")
        .select("id, client_name")
        .eq("lawyer_id", user.id)
        .neq("link_state", "archived")
        .order("updated_at", { ascending: false });
      setClients((rows as any[]) || []);
    })();
  }, [user, isLawyer]);

  // Данные выбранного клиента.
  useEffect(() => {
    if (!user || !clientId) { setData(null); return; }
    setLoadingData(true);
    (async () => {
      const { data: lc } = await supabase
        .from("lawyer_clients")
        .select("*")
        .eq("id", clientId)
        .eq("lawyer_id", user.id)
        .maybeSingle();
      if (!lc) { setData(null); setLoadingData(false); return; }

      let clientProfile: Record<string, any> | null = null;
      let docs: DocItem[] = [];
      let hasAccess = false;
      if ((lc as any).client_user_id) {
        const { data: access } = await supabase
          .from("client_document_access")
          .select("id")
          .eq("client_user_id", (lc as any).client_user_id)
          .eq("lawyer_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (access) {
          hasAccess = true;
          const [{ data: prof }, { data: md }] = await Promise.all([
            supabase.from("profiles").select("*").eq("id", (lc as any).client_user_id).maybeSingle(),
            supabase.from("medical_documents_v2")
              .select("id, title, document_date, meta, document_types(name), document_subtypes(name)")
              .eq("user_id", (lc as any).client_user_id)
              .order("document_date", { ascending: false }),
          ]);
          clientProfile = (prof as any) || null;
          docs = mapMedicalDocs(md as any[]);
        }
      }

      // Слияние: профиль клиента (если открыт доступ) + базовые поля из карточки CRM.
      const merged: Record<string, any> = {
        ...(clientProfile || {}),
        full_name: clientProfile?.full_name || (lc as any).client_name || "",
        phone: clientProfile?.phone || (lc as any).client_phone || "",
        diagnosis: (lc as any).diagnosis || clientProfile?.diagnosis || "",
        expected_category: (lc as any).expected_category || clientProfile?.expected_category || "",
      };
      setData({
        profile: merged,
        docs,
        email: (lc as any).client_email || null,
        name: (lc as any).client_name || "Клиент",
        hasAccess,
      });
      setLoadingData(false);
    })();
  }, [user, clientId]);

  if (authLoading || profileLoading || !user || !isLawyer) {
    return (
      <div className="min-h-screen bg-background"><Header />
        <main className="container mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </main>
      </div>
    );
  }

  // Селектор клиента + статус доступа — над каталогом шаблонов.
  const selector = (
    <Card className="mb-2 border-primary/20">
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <Label className="text-sm text-muted-foreground">Клиент:</Label>
        {/* Комбобокс с поиском: при десятках клиентов скроллить Select мучительно */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              className="h-9 w-full max-w-[280px] justify-between font-normal"
            >
              <span className="truncate">
                {clients.find((c) => c.id === clientId)?.client_name || "Выберите клиента"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 flex-shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Поиск по имени…" />
              <CommandList>
                <CommandEmpty>Клиент не найден</CommandEmpty>
                <CommandGroup>
                  {clients.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.client_name}
                      onSelect={() => {
                        setParams({ client: c.id });
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", clientId === c.id ? "opacity-100" : "opacity-0")} />
                      {c.client_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {loadingData && <span className="text-xs text-muted-foreground">загрузка…</span>}
        {data && (
          data.hasAccess ? (
            <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" /> Данные клиента открыты
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <ShieldOff className="h-3 w-3" /> Базовые данные из CRM (доступ к досье не открыт)
            </Badge>
          )
        )}
        {clientId && (
          <Button variant="ghost" size="sm" className="ml-auto h-8" asChild>
            <Link to={`/lawyer/clients/${clientId}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> К карточке</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <TemplatesWorkspace
        profile={data?.profile || null}
        docs={data?.docs || []}
        email={data?.email || null}
        storageKey="nepriziv_lawyer_templates_v1"
        onBack={() => (clientId ? navigate(`/lawyer/clients/${clientId}`) : navigate("/lawyer"))}
        heading="Шаблоны документов"
        subtitle={
          data
            ? `Поля заполняются данными клиента «${data.name}». Гос-структуры найдём по его адресу. Проверьте и при необходимости поправьте.`
            : "Выберите клиента — поля заполнятся его данными. Можно заполнять и вручную."
        }
        headerExtra={selector}
      />
      <Footer />
    </div>
  );
};

export default LawyerTemplatesPage;
