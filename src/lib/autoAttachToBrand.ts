import { supabase } from "@/integrations/supabase/client";

/**
 * Автопривязка только что зарегистрированного клиента к юристу-владельцу
 * текущего бренда. Вызывается из auth-страниц после успешного входа/регистрации,
 * если активен white-label контекст (юзер пришёл по ссылке /u/<slug>).
 *
 * Создаёт запись в lawyer_clients с обезличенным client_name (контакты
 * клиента не утекают, пока он не откроет доступ к документам).
 *
 * Идемпотентно: если запись уже есть — не дублирует.
 */
export async function autoAttachToBrand(clientUserId: string, lawyerUserId: string): Promise<void> {
  if (!clientUserId || !lawyerUserId) return;
  if (clientUserId === lawyerUserId) return; // юрист сам открыл свою ссылку — не привязываем

  try {
    const { data: existing } = await supabase
      .from("lawyer_clients")
      .select("id")
      .eq("lawyer_id", lawyerUserId)
      .eq("client_user_id", clientUserId)
      .maybeSingle();

    if (existing) return;

    // Пытаемся достать живое имя клиента (а не безликий "Клиент #abc..."):
    //   1) profiles.full_name (если триггер create_profile уже сработал);
    //   2) auth user_metadata.full_name (из oauth/SSO/регистрации);
    //   3) email — лучше, чем UUID-стаб;
    //   4) фолбэк — "Клиент #<8 симв.>".
    let displayName: string | null = null;

    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", clientUserId)
        .maybeSingle();
      displayName = (prof as any)?.full_name || null;
    } catch { /* RLS / отсутствие профиля — не критично */ }

    if (!displayName) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id === clientUserId) {
          const meta = (user.user_metadata || {}) as Record<string, unknown>;
          displayName = (meta.full_name as string)
            || (meta.name as string)
            || user.email
            || null;
        }
      } catch { /* нет сессии — фолбэк */ }
    }

    const clientName = displayName?.trim() || `Клиент #${clientUserId.substring(0, 8)}`;

    await supabase.from("lawyer_clients").insert({
      lawyer_id: lawyerUserId,
      client_user_id: clientUserId,
      client_name: clientName,
      crm_stage: "initial_contact",
      priority: "high",
    });
  } catch (error) {
    // Тихая ошибка — авто-привязка не критична для самого факта регистрации.
    // Юрист увидит клиента в CRM при следующем заходе по ссылке.
    console.error("autoAttachToBrand failed:", error);
  }
}
