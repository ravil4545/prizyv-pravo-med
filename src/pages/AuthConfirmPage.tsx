import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

// Supabase редиректит сюда из письма-подтверждения (emailRedirectTo). Клиент с
// detectSessionInUrl сам разбирает токены из URL и поднимает сессию — мы только
// ждём её и уводим в кабинет. Раньше роута не было → после клика в письме человек
// попадал на 404 «Страница не найдена» и уходил (см. аудит конверсии 2026-06-25).
const AuthConfirmPage = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const go = (session: Session | null) => {
      if (session && !done) {
        done = true;
        navigate("/dashboard", { replace: true });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => go(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => go(session));

    // Если за 6 секунд сессия не появилась — ссылка устарела/уже использована.
    const t = setTimeout(() => { if (!done) setFailed(true); }, 6000);

    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      {!failed ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Подтверждаем почту и входим…</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">Ссылка устарела</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Аккаунт уже создан — войдите по email и паролю.
          </p>
          <Link to="/auth" className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
            Войти
          </Link>
        </>
      )}
    </div>
  );
};

export default AuthConfirmPage;
