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
import { Loader2, Users, Search, ArrowLeft } from "lucide-react";
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

const AdminUsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
    await loadUsers();
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // 1. Fetch ALL registered users from auth via edge function (primary source)
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" },
      });

      if (edgeError) throw new Error(edgeError.message || "Ошибка загрузки пользователей");
      const authUsers = edgeData?.users || [];

      // 2. Fetch profiles and subscriptions in parallel
      const [profilesRes, subsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone"),
        supabase.from("user_subscriptions").select("*"),
      ]);

      const profilesMap = new Map<string, any>();
      profilesRes.data?.forEach(p => profilesMap.set(p.id, p));

      const subsMap = new Map<string, any>();
      subsRes.data?.forEach(s => subsMap.set(s.user_id, s));

      // 3. Build rows from auth users (all registered), enriching with profile/subscription
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

  const togglePaidMode = async (userId: string, currentOverride: boolean) => {
    try {
      // Check if subscription exists
      const user = users.find(u => u.id === userId);

      if (!user?.subscription_id) {
        // Create subscription first
        const { error: insertError } = await supabase
          .from("user_subscriptions")
          .insert({
            user_id: userId,
            admin_override: !currentOverride,
            is_paid: !currentOverride,
            paid_until: !currentOverride
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
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
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
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
          <Badge variant="secondary">{users.length} чел.</Badge>
        </div>

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
                            {user.created_at
                              ? new Date(user.created_at).toLocaleDateString("ru-RU")
                              : "—"}
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
                            {user.paid_until
                              ? new Date(user.paid_until).toLocaleDateString("ru-RU")
                              : "—"}
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
      </main>
      <Footer />
    </div>
  );
};

export default AdminUsersPage;
