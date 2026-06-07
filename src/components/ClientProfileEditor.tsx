/* eslint-disable @typescript-eslint/no-explicit-any -- профиль клиента из БД читается динамически без сгенерированного типа */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { User, ShieldCheck, Pencil, Save, X, Loader2 } from "lucide-react";

interface Field { label: string; key: string; type?: "date"; }

// Полная схема профиля клиента (profiles). Все разделы и поля — то, что юристу
// нужно для заявлений. Ключи = колонки profiles.
const PROFILE_SCHEMA: { title: string; fields: Field[] }[] = [
  { title: "Личные данные", fields: [
    { label: "ФИО", key: "full_name" },
    { label: "Дата рождения", key: "birth_date", type: "date" },
    { label: "Место рождения", key: "birth_place" },
    { label: "Телефон", key: "phone" },
  ] },
  { title: "Паспорт", fields: [
    { label: "Серия", key: "passport_series" },
    { label: "Номер", key: "passport_number" },
    { label: "Кем выдан", key: "passport_issued_by" },
    { label: "Дата выдачи", key: "passport_issue_date", type: "date" },
    { label: "Код подразделения", key: "passport_code" },
  ] },
  { title: "Адреса", fields: [
    { label: "Регистрация", key: "registration_address" },
    { label: "Фактический", key: "actual_address" },
    { label: "Город", key: "city" },
    { label: "Регион", key: "region" },
  ] },
  { title: "Воинский учёт", fields: [
    { label: "Военкомат", key: "military_commissariat" },
    { label: "Адрес военкомата", key: "military_commissariat_address" },
    { label: "Вышестоящий ВК", key: "superior_military_commissariat" },
    { label: "Адрес вышестоящего ВК", key: "superior_military_commissariat_address" },
  ] },
  { title: "Образование", fields: [
    { label: "Учебное заведение", key: "education_institution" },
    { label: "Тип обучения", key: "education_type" },
    { label: "Специальность", key: "education_specialty" },
    { label: "Курс", key: "education_course" },
  ] },
  { title: "Работа", fields: [
    { label: "Место работы", key: "work_place" },
    { label: "Должность", key: "work_position" },
    { label: "Адрес работы", key: "work_address" },
  ] },
  { title: "Для жалоб и исков", fields: [
    { label: "Суд (по военкомату)", key: "court_by_military" },
    { label: "Суд (по прописке)", key: "court_by_registration" },
    { label: "Прокуратура", key: "prosecutor_office" },
  ] },
];

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("ru-RU") : "");

interface Props {
  profile: Record<string, any>;
  clientUserId: string;
  /** Вызывается после успешного сохранения с обновлёнными полями. */
  onSaved: (updated: Record<string, any>) => void;
}

/**
 * Профиль клиента в карточке юриста. Показывает ВЕСЬ профиль; юрист может
 * заполнить/поправить данные за клиента (если клиент сам не заполнил) — запись
 * идёт в profiles клиента (RLS: «Lawyer updates granted client profile», гейт по
 * активному client_document_access). Данные сразу доступны в документах.
 */
export default function ClientProfileEditor({ profile, clientUserId, onSaved }: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    const d: Record<string, string> = {};
    for (const g of PROFILE_SCHEMA) for (const f of g.fields) d[f.key] = (profile[f.key] ?? "") as string;
    setDraft(d);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const updates: Record<string, any> = {};
    for (const g of PROFILE_SCHEMA) for (const f of g.fields) {
      const v = (draft[f.key] ?? "").trim();
      updates[f.key] = v || null;
    }
    const { error } = await supabase.from("profiles").update(updates).eq("id", clientUserId);
    setSaving(false);
    if (error) {
      toast({ title: "Не удалось сохранить", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(updates);
    setEditing(false);
    toast({ title: "Профиль клиента сохранён", description: "Данные доступны в документах и автозаполнении." });
  };

  const totalRows = PROFILE_SCHEMA.reduce((n, g) => n + g.fields.length, 0);
  const filledCount = PROFILE_SCHEMA.reduce(
    (n, g) => n + g.fields.filter((f) => profile[f.key] && String(profile[f.key]).trim()).length,
    0,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">Профиль клиента из личного кабинета</span>
        </CardTitle>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {!editing && (
            <Badge variant="outline" className="gap-1 text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" /> Открыт клиентом
            </Badge>
          )}
          {editing ? (
            <>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditing(false)} disabled={saving}>
                <X className="mr-1 h-3.5 w-3.5" /> Отмена
              </Button>
              <Button size="sm" className="h-8" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Сохранить
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-8" onClick={startEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Заполнить / править
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {PROFILE_SCHEMA.map((g) => {
            const groupFilled = g.fields.filter((f) => profile[f.key] && String(profile[f.key]).trim()).length;
            return (
              <div key={g.title}>
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {g.title}
                  {!editing && (
                    <span className="text-[10px] normal-case tracking-normal text-muted-foreground/60">
                      {groupFilled}/{g.fields.length}
                    </span>
                  )}
                </p>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {g.fields.map((f) => {
                    const raw = profile[f.key];
                    const display = f.type === "date" ? fmtDate(raw) : raw ? String(raw) : "";
                    return (
                      <div key={f.key} className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground">{f.label}</span>
                        {editing ? (
                          <Input
                            type={f.type === "date" ? "date" : "text"}
                            value={draft[f.key] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            className="mt-0.5 h-8 text-sm"
                          />
                        ) : (
                          <span className={`text-sm break-words ${display ? "font-medium" : "text-muted-foreground/50"}`}>
                            {display || "—"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="border-t pt-2 text-[11px] text-muted-foreground">
            {editing ? (
              "Данные сохранятся в профиль клиента и будут видны ему в его кабинете."
            ) : (
              <>Заполнено {filledCount} из {totalRows} полей. Если клиент не заполнил — можно внести данные за него
              («Заполнить / править»); они уйдут в его профиль и в документы.</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
