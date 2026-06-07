/* eslint-disable @typescript-eslint/no-explicit-any -- профиль/документы из БД читаются динамически без сгенерированных типов */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DOC_TEMPLATES, DOC_CATEGORIES, FIELD_DEFS, fieldLabel, todayRu, autofillValue,
  renderTemplate, type DocTemplate, type FillContext,
} from "@/lib/docTemplates";
import {
  downloadDocx, printDoc, splitHeaderBody, isTitleLine,
  DEFAULT_FORMAT, FONT_OPTIONS, FONT_SIZE_OPTIONS, type DocFormat, type DocTable,
} from "@/lib/docxBuilder";
import {
  FileText, Search, Sparkles, MapPin, Download, Printer, Plus, Trash2, ArrowLeft,
  Save, Settings2, Loader2, Pencil, FilePlus2, FolderOpen, MoreVertical, Table as TableIcon,
} from "lucide-react";

// ── Поля, которые умеет заполнять поиск гос-структур по адресу ───────────────
const GOV_KEYS = new Set([
  "military_commissariat", "military_commissariat_address", "superior_military_commissariat",
  "court_name", "prosecutor_office", "polyclinic",
  "psychoneurological_dispensary", "narcological_dispensary",
]);

interface EditorField { id: string; key: string; label: string; value: string; multiline: boolean; }
interface EditorState {
  savedId: string | null;
  baseKey: string | null;
  title: string;
  category: string;
  fields: EditorField[];
  bodyTemplate: string;
  format: DocFormat;
  tables: DocTable[];
}
interface SavedTemplate extends EditorState { id: string; savedAt: string; }

const STORAGE_KEY = "nepriziv_user_templates_v1";

const loadSaved = (): SavedTemplate[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const persistSaved = (list: SavedTemplate[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota — игнор */ }
};

const newId = () => `t_${Math.random().toString(36).slice(2, 9)}`;

const UserTemplatesPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [docs, setDocs] = useState<{ id: string; title: string | null; document_date: string | null }[]>([]);
  const [gov, setGov] = useState<Record<string, string> | null>(null);
  const [govLoading, setGovLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Все");

  const [ed, setEd] = useState<EditorState | null>(null);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);

  // диалоги
  const [editText, setEditText] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  useEffect(() => {
    setSaved(loadSaved());
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !session.user.is_anonymous) {
        const [{ data: prof }, { data: md }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
          supabase.from("medical_documents_v2")
            .select("id, title, document_date")
            .eq("user_id", session.user.id)
            .order("document_date", { ascending: false }),
        ]);
        setProfile((prof as any) || null);
        setDocs((md as any[]) || []);
      }
      setLoading(false);
    })();
  }, []);

  const fillCtx = (): FillContext => ({ profile, gov, today: todayRu() });

  const values = useMemo(
    () => (ed ? Object.fromEntries(ed.fields.map((f) => [f.key, f.value])) : {}),
    [ed],
  );
  const previewText = useMemo(
    () => (ed ? renderTemplate(ed.bodyTemplate, values) : ""),
    [ed, values],
  );

  // ── Открыть базовый шаблон в редакторе с автозаполнением ──────────────────
  const openTemplate = (t: DocTemplate) => {
    const ctx = fillCtx();
    const fields: EditorField[] = t.fieldKeys.map((k, i) => ({
      id: `${k}-${i}`,
      key: k,
      label: fieldLabel(k),
      value: autofillValue(k, ctx),
      multiline: !!FIELD_DEFS[k]?.multiline,
    }));
    setEd({
      savedId: null, baseKey: t.key, title: t.title, category: t.category,
      fields, bodyTemplate: t.bodyTemplate, format: { ...DEFAULT_FORMAT }, tables: [],
    });
    setEditText(false);
  };

  const openSaved = (s: SavedTemplate) => {
    setEd({ ...s, savedId: s.id, fields: s.fields.map((f) => ({ ...f })), tables: s.tables.map((t) => ({ ...t, rows: t.rows.map((r) => [...r]) })) });
    setSavedOpen(false);
    setEditText(false);
  };

  const patch = (p: Partial<EditorState>) => setEd((e) => (e ? { ...e, ...p } : e));
  const setField = (id: string, value: string) =>
    setEd((e) => (e ? { ...e, fields: e.fields.map((f) => (f.id === id ? { ...f, value } : f)) } : e));

  // ── Автозаполнение из профиля (только пустые поля) ─────────────────────────
  const autofillFromProfile = () => {
    if (!ed) return;
    const ctx = fillCtx();
    let filled = 0;
    const fields = ed.fields.map((f) => {
      if (f.value.trim()) return f;
      const v = autofillValue(f.key, ctx);
      if (v) { filled++; return { ...f, value: v }; }
      return f;
    });
    patch({ fields });
    toast({ title: filled ? `Заполнено полей: ${filled}` : "Нечего заполнять", description: filled ? "Данные взяты из профиля" : "Все доступные поля уже заполнены или нет данных в профиле." });
  };

  // ── Поиск гос-структур по адресу регистрации ──────────────────────────────
  const findGov = async () => {
    if (!profile?.registration_address && !profile?.city) {
      toast({ title: "Нет адреса", description: "Укажите город и адрес регистрации в профиле.", variant: "destructive" });
      return;
    }
    setGovLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("find-government-structures", {
        body: { city: profile.city, address: profile.registration_address, region: profile.region },
      });
      if (error) throw error;
      const s = (data?.suggestions || {}) as Record<string, string>;
      setGov(s);
      if (ed) {
        const ctx: FillContext = { profile, gov: s, today: todayRu() };
        let filled = 0;
        const fields = ed.fields.map((f) => {
          if (!GOV_KEYS.has(f.key)) return f;
          const v = autofillValue(f.key, ctx);
          if (v) { filled++; return { ...f, value: v }; }
          return f;
        });
        patch({ fields });
        toast({ title: "Гос-структуры найдены", description: `Заполнено полей: ${filled}. Проверьте и отредактируйте.` });
      } else {
        toast({ title: "Гос-структуры найдены", description: "Откройте шаблон — поля заполнятся." });
      }
    } catch (e) {
      toast({ title: "Не удалось найти", description: e instanceof Error ? e.message : "Ошибка ИИ-помощника", variant: "destructive" });
    } finally {
      setGovLoading(false);
    }
  };

  // ── Поля: добавить / удалить / вставить токен в текст ──────────────────────
  const addField = (key: string, label: string) => {
    if (!ed) return;
    const ctx = fillCtx();
    const field: EditorField = {
      id: newId(), key, label: label || fieldLabel(key),
      value: autofillValue(key, ctx), multiline: !!FIELD_DEFS[key]?.multiline,
    };
    patch({ fields: [...ed.fields, field] });
    setAddFieldOpen(false);
    toast({ title: "Поле добавлено", description: `«${field.label}». Нажмите «в текст», чтобы вставить в документ.` });
  };
  const removeField = (id: string) => {
    if (!ed) return;
    const f = ed.fields.find((x) => x.id === id);
    const fields = ed.fields.filter((x) => x.id !== id);
    let body = ed.bodyTemplate;
    if (f) body = body.replace(new RegExp(`\\{\\{\\s*${f.key}\\s*\\}\\}`, "g"), "");
    patch({ fields, bodyTemplate: body });
  };
  const insertToken = (key: string) => {
    if (!ed) return;
    const sep = ed.bodyTemplate.endsWith("\n") ? "" : "\n";
    patch({ bodyTemplate: `${ed.bodyTemplate}${sep}{{${key}}}` });
    toast({ title: "Вставлено в текст", description: `{{${key}}} добавлено в конец документа.` });
  };

  // ── Вставка документов из медкарты ────────────────────────────────────────
  const insertDocs = (ids: string[]) => {
    if (!ed) return;
    const chosen = docs.filter((d) => ids.includes(d.id));
    if (!chosen.length) { setDocsOpen(false); return; }
    const listStr = chosen
      .map((d, i) => `${i + 1}. ${d.title || "Документ"}${d.document_date ? ` (от ${new Date(d.document_date).toLocaleDateString("ru-RU")})` : ""}`)
      .join("\n");
    const target = ed.fields.find((f) => /docs|exam/.test(f.key));
    if (target) {
      const merged = target.value.trim() ? `${target.value.trim()}\n${listStr}` : listStr;
      setField(target.id, merged);
    } else {
      const field: EditorField = { id: newId(), key: "docs_list", label: "Перечень прилагаемых документов", value: listStr, multiline: true };
      patch({ fields: [...ed.fields, field] });
      insertToken("docs_list");
    }
    setDocsOpen(false);
    toast({ title: "Документы вставлены", description: `${chosen.length} шт. добавлено в перечень.` });
  };

  // ── Таблицы ───────────────────────────────────────────────────────────────
  const addTable = () => {
    if (!ed) return;
    patch({ tables: [...ed.tables, { headerRow: true, rows: [["Колонка 1", "Колонка 2"], ["", ""]] }] });
  };
  const updateTable = (idx: number, t: DocTable) =>
    setEd((e) => (e ? { ...e, tables: e.tables.map((x, i) => (i === idx ? t : x)) } : e));
  const removeTable = (idx: number) =>
    setEd((e) => (e ? { ...e, tables: e.tables.filter((_, i) => i !== idx) } : e));

  // ── Сохранение в localStorage ─────────────────────────────────────────────
  const saveTemplate = () => {
    if (!ed) return;
    const id = ed.savedId || newId();
    const rec: SavedTemplate = { ...ed, id, savedId: id, savedAt: new Date().toISOString() };
    const list = [rec, ...saved.filter((s) => s.id !== id)];
    setSaved(list);
    persistSaved(list);
    patch({ savedId: id });
    toast({ title: "Шаблон сохранён", description: "Доступен в «Мои шаблоны» на этом устройстве." });
  };
  const deleteSaved = (id: string) => {
    const list = saved.filter((s) => s.id !== id);
    setSaved(list);
    persistSaved(list);
  };

  // ── Экспорт ───────────────────────────────────────────────────────────────
  const exportDocx = async () => {
    if (!ed) return;
    try {
      await downloadDocx({ title: ed.title, text: previewText, tables: ed.tables, format: ed.format });
      toast({ title: "DOCX скачан", description: "Файл откроется в Word/LibreOffice." });
    } catch (e) {
      toast({ title: "Ошибка экспорта", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  const exportPrint = () => {
    if (!ed) return;
    printDoc({ title: ed.title, text: previewText, tables: ed.tables, format: ed.format });
  };

  const unusedFieldKeys = useMemo(() => {
    const used = new Set(ed?.fields.map((f) => f.key) || []);
    return Object.keys(FIELD_DEFS).filter((k) => !used.has(k));
  }, [ed]);

  // ════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="min-h-screen bg-background"><Header />
        <main className="container mx-auto px-4 py-12 text-center text-muted-foreground">Загрузка…</main>
      </div>
    );
  }

  // ── Каталог шаблонов ──────────────────────────────────────────────────────
  if (!ed) {
    const filtered = DOC_TEMPLATES.filter((t) => {
      if (cat !== "Все" && t.category !== cat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    });
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-5xl">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> В кабинет
            </Button>

            <div className="mb-6">
              <h1 className="text-2xl font-bold md:text-3xl">Шаблоны документов</h1>
              <p className="mt-1 text-muted-foreground">
                Выберите шаблон — поля заполнятся из вашего профиля, военкоматы и диспансеры найдём по адресу.
                Документ можно отредактировать и скачать в DOCX или распечатать в PDF.
              </p>
            </div>

            {/* Панель действий */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск шаблона…" className="pl-9" />
              </div>
              {saved.length > 0 && (
                <Button variant="outline" onClick={() => setSavedOpen(true)} className="flex-shrink-0">
                  <FolderOpen className="mr-2 h-4 w-4" /> Мои шаблоны
                  <Badge variant="secondary" className="ml-2">{saved.length}</Badge>
                </Button>
              )}
              <Button variant="outline" onClick={findGov} disabled={govLoading} className="flex-shrink-0">
                {govLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                Гос-структуры по адресу
              </Button>
            </div>

            {/* Категории */}
            <div className="mb-6 flex flex-wrap gap-2">
              {DOC_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    cat === c ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((t) => (
                <Card key={t.key} className="flex flex-col transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-tight">{t.title}</CardTitle>
                        <Badge variant="outline" className="mt-1.5 text-[10px]">{t.category}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <CardDescription className="flex-1 break-words">{t.description}</CardDescription>
                    <Button className="mt-3 w-full" onClick={() => openTemplate(t)}>
                      <Pencil className="mr-2 h-4 w-4" /> Заполнить
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
        <Footer />

        <SavedDialog open={savedOpen} onOpenChange={setSavedOpen} saved={saved} onOpen={openSaved} onDelete={deleteSaved} />
      </div>
    );
  }

  // ── Редактор ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setEd(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> К шаблонам
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={saveTemplate}>
                <Save className="mr-1.5 h-4 w-4" /> Сохранить
              </Button>
              <Button variant="outline" size="sm" onClick={exportPrint}>
                <Printer className="mr-1.5 h-4 w-4" /> Печать / PDF
              </Button>
              <Button size="sm" onClick={exportDocx}>
                <Download className="mr-1.5 h-4 w-4" /> Скачать DOCX
              </Button>
            </div>
          </div>

          {/* Заголовок документа (редактируемый) */}
          <Input
            value={ed.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="mb-4 h-auto border-0 border-b border-border/60 px-0 text-lg font-semibold focus-visible:ring-0"
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Левая колонка: поля + инструменты ─────────────────────── */}
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={autofillFromProfile}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Из профиля
                </Button>
                <Button variant="outline" size="sm" onClick={findGov} disabled={govLoading}>
                  {govLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MapPin className="mr-1.5 h-4 w-4" />}
                  Гос-структуры
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDocsOpen(true)} disabled={!docs.length}>
                  <FilePlus2 className="mr-1.5 h-4 w-4" /> Документы
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowFormat((v) => !v)}>
                  <Settings2 className="mr-1.5 h-4 w-4" /> Формат
                </Button>
              </div>

              {/* Формат */}
              {showFormat && (
                <Card>
                  <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Ориентация</Label>
                      <Select value={ed.format.orientation} onValueChange={(v) => patch({ format: { ...ed.format, orientation: v as DocFormat["orientation"] } })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="portrait">Книжная</SelectItem>
                          <SelectItem value="landscape">Альбомная</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Шрифт</Label>
                      <Select value={ed.format.fontFamily} onValueChange={(v) => patch({ format: { ...ed.format, fontFamily: v } })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Размер, pt</Label>
                      <Select value={String(ed.format.fontSizePt)} onValueChange={(v) => patch({ format: { ...ed.format, fontSizePt: Number(v) } })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Поля */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Поля документа</CardTitle>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setAddFieldOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Поле
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ed.fields.length === 0 && <p className="text-sm text-muted-foreground">Полей нет. Добавьте поле или редактируйте текст.</p>}
                  {ed.fields.map((f) => (
                    <div key={f.id} className="group">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Label className="min-w-0 truncate text-xs text-muted-foreground">{f.label}</Label>
                        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <button onClick={() => insertToken(f.key)} className="rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10" title="Вставить {{поле}} в текст">в текст</button>
                          <button onClick={() => removeField(f.id)} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Удалить поле"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {f.multiline ? (
                        <Textarea value={f.value} onChange={(e) => setField(f.id, e.target.value)} rows={3} placeholder={FIELD_DEFS[f.key]?.placeholder} />
                      ) : (
                        <Input value={f.value} onChange={(e) => setField(f.id, e.target.value)} placeholder={FIELD_DEFS[f.key]?.placeholder} />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Таблицы */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><TableIcon className="h-4 w-4" /> Таблицы</CardTitle>
                  <Button variant="outline" size="sm" className="h-8" onClick={addTable}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Таблица
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ed.tables.length === 0 && <p className="text-sm text-muted-foreground">Таблиц нет. Добавьте при необходимости (приложения, опись).</p>}
                  {ed.tables.map((t, i) => (
                    <TableEditor key={i} table={t} onChange={(nt) => updateTable(i, nt)} onRemove={() => removeTable(i)} />
                  ))}
                </CardContent>
              </Card>

              {/* Редактирование текста шаблона */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Текст шаблона</CardTitle>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditText((v) => !v)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> {editText ? "Свернуть" : "Редактировать"}
                  </Button>
                </CardHeader>
                {editText && (
                  <CardContent>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Используйте токены вида <code className="rounded bg-muted px-1">{"{{поле}}"}</code> — они подставятся значениями полей.
                      Можно свободно менять текст, добавлять и убирать токены.
                    </p>
                    <Textarea
                      value={ed.bodyTemplate}
                      onChange={(e) => patch({ bodyTemplate: e.target.value })}
                      rows={14}
                      className="font-mono text-xs leading-relaxed"
                    />
                  </CardContent>
                )}
              </Card>
            </div>

            {/* ── Правая колонка: превью ────────────────────────────────── */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Предпросмотр</p>
              <div className="overflow-x-auto rounded-lg border bg-white p-5 text-black shadow-sm dark:bg-neutral-100 sm:p-8" style={{ fontFamily: ed.format.fontFamily }}>
                <DocPreview text={previewText} tables={ed.tables} fontSizePt={ed.format.fontSizePt} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Данные носят справочный характер. Перед подачей проверьте реквизиты и при необходимости заверьте документ.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Диалог добавления поля */}
      <AddFieldDialog open={addFieldOpen} onOpenChange={setAddFieldOpen} unusedKeys={unusedFieldKeys} onAdd={addField} />

      {/* Диалог выбора документов */}
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Вставить документы</DialogTitle>
            <DialogDescription>Выберите загруженные медицинские документы — они добавятся в перечень приложений.</DialogDescription>
          </DialogHeader>
          <DocsPicker docs={docs} onInsert={insertDocs} />
        </DialogContent>
      </Dialog>

      <SavedDialog open={savedOpen} onOpenChange={setSavedOpen} saved={saved} onOpen={openSaved} onDelete={deleteSaved} />
    </div>
  );
};

// ── Превью документа ────────────────────────────────────────────────────────
function DocPreview({ text, tables, fontSizePt }: { text: string; tables: DocTable[]; fontSizePt: number }) {
  const { header, body } = splitHeaderBody(text);
  const bodyLines = (body || text).split("\n");
  let titleDone = false;
  return (
    <div style={{ fontSize: `${fontSizePt}pt`, lineHeight: 1.4 }} className="min-w-[280px] break-words">
      {header && <div className="mb-4 whitespace-pre-wrap text-right">{header}</div>}
      {bodyLines.map((line, i) => {
        const trimmed = line.trim();
        if (!titleDone && isTitleLine(trimmed)) {
          titleDone = true;
          return <p key={i} className="my-2 text-center font-bold" style={{ fontSize: `${fontSizePt + 2}pt` }}>{trimmed}</p>;
        }
        if (!titleDone) return <p key={i} className="mb-2 text-center italic">{trimmed || " "}</p>;
        return <p key={i} className="mb-1.5 whitespace-pre-wrap text-justify">{line || " "}</p>;
      })}
      {tables.filter((t) => t.rows.length).map((t, ti) => (
        <table key={ti} className="my-3 w-full border-collapse">
          <tbody>
            {t.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) =>
                  t.headerRow && ri === 0
                    ? <th key={ci} className="border border-black px-2 py-1 text-left font-bold">{c}</th>
                    : <td key={ci} className="border border-black px-2 py-1 align-top">{c || " "}</td>,
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

// ── Редактор таблицы ────────────────────────────────────────────────────────
function TableEditor({ table, onChange, onRemove }: { table: DocTable; onChange: (t: DocTable) => void; onRemove: () => void }) {
  const cols = table.rows[0]?.length || 0;
  const setCell = (r: number, c: number, v: string) =>
    onChange({ ...table, rows: table.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)) });
  const addRow = () => onChange({ ...table, rows: [...table.rows, Array(cols).fill("")] });
  const addCol = () => onChange({ ...table, rows: table.rows.map((row) => [...row, ""]) });
  const delRow = (r: number) => onChange({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  const delCol = (c: number) => onChange({ ...table, rows: table.rows.map((row) => row.filter((_, i) => i !== c)) });

  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={table.headerRow} onCheckedChange={(v) => onChange({ ...table, headerRow: !!v })} />
          Первая строка — заголовок
        </label>
        <button onClick={onRemove} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Удалить таблицу"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border p-0.5">
                    <Input value={cell} onChange={(e) => setCell(ri, ci, e.target.value)} className="h-8 min-w-[90px] border-0 text-xs focus-visible:ring-1" />
                  </td>
                ))}
                <td className="pl-1">
                  <button onClick={() => delRow(ri)} className="text-muted-foreground hover:text-destructive" title="Удалить строку" disabled={table.rows.length <= 1}><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}><Plus className="mr-1 h-3 w-3" /> строка</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addCol}><Plus className="mr-1 h-3 w-3" /> столбец</Button>
        {cols > 1 && <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => delCol(cols - 1)}>− столбец</Button>}
      </div>
    </div>
  );
}

// ── Диалог добавления поля ──────────────────────────────────────────────────
function AddFieldDialog({ open, onOpenChange, unusedKeys, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void; unusedKeys: string[]; onAdd: (key: string, label: string) => void;
}) {
  const [customLabel, setCustomLabel] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить поле</DialogTitle>
          <DialogDescription>Выберите готовое поле (заполнится из профиля) или создайте своё.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {unusedKeys.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Готовые поля</Label>
              <div className="mt-1.5 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {unusedKeys.map((k) => (
                  <button key={k} onClick={() => onAdd(k, fieldLabel(k))} className="rounded-full border px-2.5 py-1 text-xs hover:border-primary hover:bg-primary/10">
                    {fieldLabel(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Своё поле</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Название поля" />
              <Button
                disabled={!customLabel.trim()}
                onClick={() => {
                  const key = `custom_${Math.random().toString(36).slice(2, 7)}`;
                  onAdd(key, customLabel.trim());
                  setCustomLabel("");
                }}
              >
                Добавить
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Пикер документов ────────────────────────────────────────────────────────
function DocsPicker({ docs, onInsert }: { docs: { id: string; title: string | null; document_date: string | null }[]; onInsert: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {docs.map((d) => (
          <label key={d.id} className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 hover:bg-muted/50">
            <Checkbox checked={sel.includes(d.id)} onCheckedChange={() => toggle(d.id)} className="mt-0.5" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{d.title || "Без названия"}</p>
              {d.document_date && <p className="text-xs text-muted-foreground">от {new Date(d.document_date).toLocaleDateString("ru-RU")}</p>}
            </div>
          </label>
        ))}
      </div>
      <DialogFooter>
        <Button disabled={!sel.length} onClick={() => onInsert(sel)}>Вставить ({sel.length})</Button>
      </DialogFooter>
    </>
  );
}

// ── Диалог «Мои шаблоны» ────────────────────────────────────────────────────
function SavedDialog({ open, onOpenChange, saved, onOpen, onDelete }: {
  open: boolean; onOpenChange: (v: boolean) => void; saved: SavedTemplate[];
  onOpen: (s: SavedTemplate) => void; onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Мои шаблоны</DialogTitle>
          <DialogDescription>Сохранённые на этом устройстве. Откройте, чтобы продолжить редактирование.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {saved.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Пока нет сохранённых шаблонов.</p>}
          {saved.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border p-2.5">
              <button onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.savedAt).toLocaleString("ru-RU")}</p>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onOpen(s)}>Открыть</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(s.id)}>Удалить</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserTemplatesPage;
