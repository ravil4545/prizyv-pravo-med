import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * 152-ФЗ: одноразовый сбор согласия на обработку ПДн (вкл. медданные) для
 * зарегистрированных пользователей, у кого согласие ещё не зафиксировано.
 * Покрывает и новых, и существующих пользователей (в отличие от галочки только
 * на регистрации). Запись — через RPC record_pdn_consent (миграция 20260530120000).
 *
 * ⚠️ Текст согласия ниже — ЗАГЛУШКА. Финальную юридическую формулировку и
 * содержимое /privacy должен утвердить владелец/юрист.
 */
const CONSENT_VERSION = "v1";

const PdnConsentGate = () => {
  const { user, loading } = useAuth();
  const [needConsent, setNeedConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || !user || user.is_anonymous) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("pdn_consent_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data && !data.pdn_consent_at) setNeedConsent(true);
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  const accept = async () => {
    if (!agreed) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("record_pdn_consent", {
        p_version: CONSENT_VERSION,
      });
      if (!error) setNeedConsent(false);
    } finally {
      setSaving(false);
    }
  };

  if (!needConsent) return null;

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Согласие на обработку данных</DialogTitle>
          <DialogDescription>
            {/* ⚠️ ТЕКСТ-ЗАГЛУШКА — финальную формулировку согласовать с юристом */}
            Для анализа ваших медицинских документов с помощью ИИ нам необходимо ваше
            согласие на обработку персональных данных, включая сведения о состоянии
            здоровья (специальная категория ПДн), в соответствии с 152-ФЗ.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 text-sm cursor-pointer py-2">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5"
          />
          <span>
            Я даю согласие на обработку моих персональных данных, включая данные о
            здоровье, и ознакомлен с{" "}
            <Link to="/privacy" target="_blank" className="underline text-primary">
              политикой конфиденциальности
            </Link>
            .
          </span>
        </label>

        <div className="flex items-center justify-between gap-2 mt-1">
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            Отказаться и выйти
          </Button>
          <Button onClick={accept} disabled={!agreed || saving}>
            {saving ? "Сохраняем…" : "Согласен, продолжить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdnConsentGate;
