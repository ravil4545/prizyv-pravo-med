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

    const anonName = `Клиент #${clientUserId.substring(0, 8)}`;
    await supabase.from("lawyer_clients").insert({
      lawyer_id: lawyerUserId,
      client_user_id: clientUserId,
      client_name: anonName,
      crm_stage: "initial_contact",
      priority: "high",
    });
  } catch (error) {
    // Тихая ошибка — авто-привязка не критична для самого факта регистрации.
    // Юрист увидит клиента в CRM при следующем заходе по ссылке.
    console.error("autoAttachToBrand failed:", error);
  }
}
