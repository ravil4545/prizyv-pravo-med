import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, Search, ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  is_paid: boolean;
  paid_until: string | null;
  admin_override: boolean;
  document_uploads_used: number;
  ai_questions_used: number;
  subscription_id: string | null;
  payment_link_clicked_at: string | null;
}

interface DemoVisitorRow {
  id: string;
  anonymous_user_id: string;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  city: string | null;
  country: string | null;
  document_uploads_used: number;
  ai_questions_used: number;
  first_visit_at: string;
  last_visit_at: string;
  converted_to_user: boolean;
}

const AdminUsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [demoVisitors, setDemoVisitors] = useState<DemoVisitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoLoading, setDemoLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [demoSearch, setDemoSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    const hasAdmin = roles?.some(r => r.role === "admin");
    if (!hasAdmin) {
      navigate("/dashboard");
      return;
    }
    setIsAdmin(true);
    await Promise.all([loadUsers(), loadDemoVisitors()]);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });

      if (edgeError) throw new Error(edgeError.message || "Ошибка загрузки пользователей");
      const authUsers = edgeData?.users || [];

      const [profilesRes, subsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone"),
        supabase.from("user_subscriptions").select("*"),
      ]);

      const profilesMap = new Map<string, any>();
      profilesRes.data?.forEach(p => profilesMap.set(p.id, p));

      const subsMap = new Map<string, any>();
      subsRes.data?.forEach(s => subsMap.set(s.user_id, s));

      const userRows: UserRow[] = (authUsers || []).map((au: any) => {
        const profile = profilesMap.get(au.id);
        const sub = subsMap.get(au.id);
        return {
          id: au.id,
          email: au.email || "—",
          created_at: au.created_at || "",
          full_name: profile?.full_name || null,
          phone: profile?.phone || null,
          is_paid: sub?.is_paid || false,
          paid_until: sub?.paid_until || null,
          admin_override: sub?.admin_override || false,
          document_uploads_used: sub?.document_uploads_used || 0,
          ai_questions_used: sub?.ai_questions_used || 0,
          subscription_id: sub?.id || null,
          payment_link_clicked_at: sub?.payment_link_clicked_at || null,
        };
      });

      setUsers(userRows);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Ошибка загрузки пользователей");
    } finally {
      setLoading(false);
    }
  };

  const loadDemoVisitors = async () => {
    setDemoLoading(true);
    try {
      const { data, error } = await supabase
        .from("demo_visitors")
        .select("*")
        .order("last_visit_at", { ascending: false });

      if (error) throw error;
      setDemoVisitors((data || []) as unknown as DemoVisitorRow[]);
    } catch (error) {
      console.error("Error loading demo visitors:", error);
      toast.error("Ошибка загрузки демо-посетителей");
    } finally {
      setDemoLoading(false);
    }
  };

  const togglePaidMode = async (userId: string, currentOverride: boolean) => {
    try {
      const user = users.find(u => u.id === userId);

      if (!user?.subscription_id) {
        const { error: insertError } = await supabase
          .from("user_subscriptions")
          .insert({
            user_id: userId,
            admin_override: !currentOverride,
            is_paid: !currentOverride,
            paid_until: !currentOverride
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          });
        if (insertError) throw insertError;
      } else {
        const { error } = await supabase
          .from("user_subscriptions")
          .update({
            admin_override: !currentOverride,
            is_paid: !currentOverride,
            paid_until: !currentOverride
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          })
          .eq("user_id", userId);
        if (error) throw error;
      }

      setUsers(prev =>
        prev.map(u =>
          u.id === userId
            ? { ...u, admin_override: !currentOverride, is_paid: !currentOverride }
            : u
        )
      );
      toast.success(!currentOverride ? "Платный режим включён" : "Переключено на бесплатный");
    } catch (error) {
      console.error("Error toggling mode:", error);
      toast.error("Ошибка при изменении режима");
    }
  };

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || "").includes(q)
    );
  });

  const filteredDemoVisitors = demoVisitors.filter(v => {
    const q = demoSearch.toLowerCase();
    return (
      (v.browser || "").toLowerCase().includes(q) ||
      (v.os || "").toLowerCase().includes(q) ||
      (v.city || "").toLowerCase().includes(q) ||
      (v.country || "").toLowerCase().includes(q) ||
      (v.device_type || "").toLowerCase().includes(q)
    );
  });

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Управление пользователями</h1>
        </div>

        <Tabs defaultValue="registered" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registered">
              Зарегистрированные <Badge variant="secondary" className="ml-2">{users.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="demo">
              Демо-посетители <Badge variant="secondary" className="ml-2">{demoVisitors.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registered">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по ФИО, email, телефону..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="max-w-md"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата регистрации</TableHead>
                          <TableHead>ФИО</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Телефон</TableHead>
                          <TableHead>Загрузок</TableHead>
                          <TableHead>Вопросов AI</TableHead>
                          <TableHead>Переход к оплате</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Оплачено до</TableHead>
                          <TableHead>Режим</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                              Пользователи не найдены
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map(user => (
                            <TableRow key={user.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {user.created_at ? new Date(user.created_at).toLocaleDateString("ru-RU") : "—"}
                              </TableCell>
                              <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                              <TableCell className="text-sm">{user.email}</TableCell>
                              <TableCell className="text-sm">{user.phone || "—"}</TableCell>
                              <TableCell className="text-center">{user.document_uploads_used}</TableCell>
                              <TableCell className="text-center">{user.ai_questions_used}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {user.payment_link_clicked_at
                                  ? new Date(user.payment_link_clicked_at).toLocaleString("ru-RU")
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {user.admin_override || user.is_paid ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    Оплачено
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Бесплатно</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {user.paid_until ? new Date(user.paid_until).toLocaleDateString("ru-RU") : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Бесп.</span>
                                  <Switch
                                    checked={user.admin_override}
                                    onCheckedChange={() => togglePaidMode(user.id, user.admin_override)}
                                  />
                                  <span className="text-xs text-muted-foreground">Платн.</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="demo">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                  Посетители в демо-режиме (без регистрации)
                </CardTitle>
                <div className="flex items-center gap-3 mt-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по браузеру, ОС, городу..."
                    value={demoSearch}
                    onChange={e => setDemoSearch(e.target.value)}
                    className="max-w-md"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {demoLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Первый визит</TableHead>
                          <TableHead>Последний визит</TableHead>
                          <TableHead>Браузер</TableHead>
                          <TableHead>ОС</TableHead>
                          <TableHead>Устройство</TableHead>
                          <TableHead>Город</TableHead>
                          <TableHead>Страна</TableHead>
                          <TableHead>Загрузок</TableHead>
                          <TableHead>Вопросов AI</TableHead>
                          <TableHead>Конверсия</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDemoVisitors.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                              Демо-посетители не найдены
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDemoVisitors.map(visitor => (
                            <TableRow key={visitor.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {new Date(visitor.first_visit_at).toLocaleString("ru-RU")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {new Date(visitor.last_visit_at).toLocaleString("ru-RU")}
                              </TableCell>
                              <TableCell className="text-sm">{visitor.browser || "—"}</TableCell>
                              <TableCell className="text-sm">{visitor.os || "—"}</TableCell>
                              <TableCell className="text-sm">{visitor.device_type || "—"}</TableCell>
                              <TableCell className="text-sm">{visitor.city || "—"}</TableCell>
                              <TableCell className="text-sm">{visitor.country || "—"}</TableCell>
                              <TableCell className="text-center">{visitor.document_uploads_used}</TableCell>
                              <TableCell className="text-center">{visitor.ai_questions_used}</TableCell>
                              <TableCell>
                                {visitor.converted_to_user ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    Да
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Нет</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
};

export default AdminUsersPage;
