import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, LogIn } from "lucide-react";

/**
 * Страница принятия приглашения в семейный доступ.
 * URL: /family/accept/:token
 *
 * Если пользователь не залогинен — предлагает войти.
 * Если залогинен — вызывает RPC accept_family_invite, который проверяет
 * совпадение email и активирует доступ.
 */
export default function FamilyAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<
    "loading" | "need-auth" | "accepting" | "success" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const check = async () => {
    if (!token) {
      setState("error");
      setErrorMsg("Ссылка некорректна");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) {
      setState("need-auth");
      return;
    }
    await accept();
  };

  const accept = async () => {
    if (!token) return;
    setState("accepting");
    const { data, error } = await supabase.rpc("accept_family_invite", { p_token: token });
    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    const result = data as Record<string, unknown> | null;
    if (result?.error) {
      setState("error");
      const errorMap: Record<string, string> = {
        invite_not_found_or_expired: "Приглашение не найдено или истекло",
        email_mismatch: "Email вашего аккаунта не совпадает с email приглашения. Войдите тем же email.",
        unauthorized: "Сначала войдите в аккаунт",
        cannot_invite_self: "Нельзя принять собственное приглашение",
      };
      setErrorMsg(errorMap[result.error as string] || String(result.error));
      return;
    }
    setState("success");
    setTimeout(() => navigate("/dashboard"), 2500);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-md">
        <Card className="border-gold/30 bg-gradient-to-br from-paper to-paper-deep/30">
          <CardContent className="p-8 text-center">
            {state === "loading" && (
              <>
                <Loader2 className="h-10 w-10 text-gold-deep animate-spin mx-auto mb-4" />
                <p className="font-serif text-xl">Проверяем приглашение…</p>
              </>
            )}

            {state === "need-auth" && (
              <>
                <LogIn className="h-12 w-12 text-gold-deep mx-auto mb-4" />
                <h1 className="font-serif text-2xl mb-2">Войдите в аккаунт</h1>
                <p className="text-sm text-muted-foreground mb-6">
                  Чтобы принять приглашение, войдите в свой аккаунт. Email должен совпадать
                  с тем, на который пришло приглашение.
                </p>
                <Button
                  onClick={() => navigate(`/auth?next=${encodeURIComponent(`/family/accept/${token}`)}`)}
                  className="bg-gold-deep hover:bg-gold-deep/90 text-paper"
                >
                  Войти / зарегистрироваться
                </Button>
              </>
            )}

            {state === "accepting" && (
              <>
                <Loader2 className="h-10 w-10 text-gold-deep animate-spin mx-auto mb-4" />
                <p className="font-serif text-xl">Активируем доступ…</p>
              </>
            )}

            {state === "success" && (
              <>
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
                <h1 className="font-serif text-2xl mb-2">Доступ предоставлен</h1>
                <p className="text-sm text-muted-foreground mb-6">
                  Теперь вы видите дело своего близкого в режиме просмотра. Переходим в кабинет…
                </p>
                <Button onClick={() => navigate("/dashboard")}>Перейти сейчас</Button>
              </>
            )}

            {state === "error" && (
              <>
                <AlertTriangle className="h-12 w-12 text-seal mx-auto mb-4" />
                <h1 className="font-serif text-2xl mb-2">Не удалось принять</h1>
                <p className="text-sm text-muted-foreground mb-6">
                  {errorMsg || "Произошла ошибка"}
                </p>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  В кабинет
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
