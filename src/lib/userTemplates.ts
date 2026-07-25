// ════════════════════════════════════════════════════════════════════════
//  Хранилище «Моих шаблонов» (§5 предложения).
//
//  Было: localStorage. Очистил кэш — потерял работу; собранное на компьютере
//  не видно с телефона; юрист не может передать шаблон коллеге.
//  Стало: таблица public.user_templates с RLS «владелец и только владелец».
//
//  Отдельный модуль, а не запросы прямо в компоненте: TemplatesWorkspace и так
//  на 870 строк, плюс логика переноса старых записей заслуживает тестов.
// ════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Кабинет, которому принадлежит шаблон. Повторяет прежний namespace localStorage. */
export type TemplateScope = "client" | "lawyer";

/** Сопоставление старых ключей localStorage со scope — нужно для переноса. */
export const LEGACY_STORAGE_KEYS: Record<string, TemplateScope> = {
  nepriziv_user_templates_v1: "client",
  nepriziv_lawyer_templates_v1: "lawyer",
};

export interface StoredTemplate {
  id: string;
  title: string;
  category: string;
  bodyTemplate: string;
  /** Поля редактора, таблицы и формат — структура целиком клиентская. */
  fields: unknown[];
  tables: unknown[];
  format: Record<string, unknown>;
  baseKey: string | null;
  savedAt: string;
}

interface DbRow {
  id: string;
  title: string;
  category: string;
  body_template: string;
  fields: unknown;
  tables: unknown;
  format: unknown;
  base_key: string | null;
  updated_at: string;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const fromRow = (r: DbRow): StoredTemplate => ({
  id: r.id,
  title: r.title,
  category: r.category,
  bodyTemplate: r.body_template,
  fields: asArray(r.fields),
  tables: asArray(r.tables),
  format: asRecord(r.format),
  baseKey: r.base_key,
  savedAt: r.updated_at,
});

export async function listTemplates(scope: TemplateScope): Promise<StoredTemplate[]> {
  const { data, error } = await supabase
    .from("user_templates")
    .select("id, title, category, body_template, fields, tables, format, base_key, updated_at")
    .eq("scope", scope)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DbRow[]).map(fromRow);
}

export interface SaveInput {
  /** Есть — обновляем, нет — создаём. */
  id?: string | null;
  scope: TemplateScope;
  title: string;
  category: string;
  bodyTemplate: string;
  fields: unknown[];
  tables: unknown[];
  format: Record<string, unknown>;
  baseKey: string | null;
}

export async function saveTemplate(input: SaveInput): Promise<StoredTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Нужно войти в аккаунт, чтобы сохранять шаблоны");

  // fields/tables/format — произвольные структуры редактора, в базе это jsonb.
  // Приведение к Json одноразовое и локализовано здесь, а не размазано по
  // компоненту.
  const payload = {
    owner_id: user.id,
    scope: input.scope,
    title: input.title.trim() || "Без названия",
    category: input.category,
    body_template: input.bodyTemplate,
    fields: input.fields as Json,
    tables: input.tables as Json,
    format: input.format as Json,
    base_key: input.baseKey,
  };

  // Обновление и создание разведены явно: upsert по id потребовал бы доверять
  // клиентскому id, а он у старых записей строковый («t_abc123»), не uuid.
  const query = input.id
    ? supabase.from("user_templates").update(payload).eq("id", input.id)
    : supabase.from("user_templates").insert(payload);

  const { data, error } = await query
    .select("id, title, category, body_template, fields, tables, format, base_key, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return fromRow(data as unknown as DbRow);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("user_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Разовый перенос шаблонов из localStorage в базу.
 *
 * Вызывается при первой загрузке списка. Старые записи НЕ удаляются сразу —
 * помечаем ключ как перенесённый и оставляем данные на месте. Если перенос
 * прошёл неудачно и человек откатится, его работа всё ещё будет в браузере.
 *
 * Возвращает число перенесённых шаблонов (0 — переносить было нечего).
 */
export async function migrateLegacyTemplates(storageKey: string, scope: TemplateScope): Promise<number> {
  const doneFlag = `${storageKey}__migrated_v1`;
  let raw: string | null = null;
  try {
    if (localStorage.getItem(doneFlag)) return 0;
    raw = localStorage.getItem(storageKey);
  } catch {
    return 0; // приватный режим / отключённое хранилище
  }
  if (!raw) return 0;

  let legacy: Array<Record<string, unknown>>;
  try {
    const parsed: unknown = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return 0;
  }
  if (!legacy.length) {
    try { localStorage.setItem(doneFlag, "1"); } catch { /* игнор */ }
    return 0;
  }

  let moved = 0;
  for (const item of legacy) {
    try {
      await saveTemplate({
        scope,
        title: String(item.title ?? "Без названия"),
        category: String(item.category ?? "Свои шаблоны"),
        bodyTemplate: String(item.bodyTemplate ?? ""),
        fields: asArray(item.fields),
        tables: asArray(item.tables),
        format: asRecord(item.format),
        baseKey: typeof item.baseKey === "string" ? item.baseKey : null,
      });
      moved++;
    } catch (e) {
      // Один битый шаблон не должен блокировать перенос остальных.
      console.error("[userTemplates] не удалось перенести шаблон:", e);
    }
  }

  try { localStorage.setItem(doneFlag, "1"); } catch { /* игнор */ }
  return moved;
}
