/* eslint-disable @typescript-eslint/no-explicit-any -- профиль/документы из БД читаются динамически без сгенерированных типов */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DOC_TEMPLATES, DOC_CATEGORIES, FIELD_DEFS, fieldLabel, todayRu, autofillValue,
  renderTemplate, extractTokens, type DocTemplate, type FillContext,
} from "@/lib/docTemplates";
import {
  downloadDocx, printDoc, splitHeaderBody, isTitleLine,
  DEFAULT_FORMAT, FONT_OPTIONS, FONT_SIZE_OPTIONS, type DocFormat, type DocTable,
} from "@/lib/docxBuilder";
import {
  FileText, Search, Sparkles, MapPin, Download, Printer, Plus, Trash2, ArrowLeft,
  Save, Settings2, Loader2, Pencil, FilePlus2, FolderOpen, MoreVertical, RotateCcw, Table as TableIcon,
  FileDown, Blocks,
} from "lucide-react";
import DocumentBlockBuilder from "@/components/DocumentBlockBuilder";
import {
  LEGACY_STORAGE_KEYS,
  listTemplates,
  migrateLegacyTemplates,
  saveTemplate as persistTemplate,
  deleteTemplate as removeTemplate,
  type StoredTemplate,
  type TemplateScope,
} from "@/lib/userTemplates";

// Поля, которые умеет заполнять поиск гос-структур по адресу.
const GOV_KEYS = new Set([
  "military_commissariat", "military_commissariat_address", "superior_military_commissariat",
  "court_name", "prosecutor_office",
  "polyclinic", "polyclinic_address",
  "psychoneurological_dispensary", "pnd_address",
  "narcological_dispensary", "kvd", "kvd_address",
]);

export interface DocItem {
  id: string;
  title: string | null;
  document_date: string | null;
  typeName?: string | null;
  issuer?: string | null;
}

/** Маппинг строк medical_documents_v2 (с join типов + meta) в DocItem. */
// eslint-disable-next-line react-refresh/only-export-components -- небольшой data-хелпер рядом с движком
export function mapMedicalDocs(rows: any[] | null | undefined): DocItem[] {
  return (rows || []).map((d) => ({
    id: d.id,
    title: d.title ?? null,
    document_date: d.document_date ?? null,
    typeName: d.document_subtypes?.name || d.document_types?.name || null,
    issuer: d.meta?.issued_by || d.meta?.issuer || d.meta?.organization || d.meta?.org || null,
  }));
}

interface EditorField { id: string; key: string; label: string; value: string; multiline: boolean; disabled?: boolean; }
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

/** Строка из базы -> состояние редактора. */
const toEditorState = (t: StoredTemplate): SavedTemplate => ({
  id: t.id,
  savedId: t.id,
  baseKey: t.baseKey,
  title: t.title,
  category: t.category,
  fields: t.fields as EditorField[],
  bodyTemplate: t.bodyTemplate,
  format: { ...DEFAULT_FORMAT, ...(t.format as Partial<DocFormat>) },
  tables: t.tables as DocTable[],
  savedAt: t.savedAt,
});

const newId = () => `t_${Math.random().toString(36).slice(2, 9)}`;

export interface TemplatesWorkspaceProps {
  /** Профиль-источник автозаполнения (свой у клиента / клиента у юриста). */
  profile: Record<string, any> | null;
  /** Документы для вставки в перечень приложений. */
  docs: DocItem[];
  /** E-mail для поля {{email}}. */
  email: string | null;
  /** Namespace localStorage для «Моих шаблонов». */
  storageKey: string;
  /** Назад из каталога. */
  onBack: () => void;
  heading?: string;
  /** Текст-подсказка под заголовком. */
  subtitle?: string;
  /** Блок над панелью действий (напр. селектор клиента у юриста). */
  headerExtra?: ReactNode;
  /**
   * Ключ шаблона из DOC_TEMPLATES — открыть сразу при монтировании.
   * Нужен для перехода из юридического чек-листа разбора дела (/razbor):
   * пункт «подать заявление о приобщении» открывает готовый шаблон, а не
   * общий каталог, где его ещё надо найти.
   */
  initialTemplateKey?: string | null;
}

const TemplatesWorkspace = ({ profile, docs, email, storageKey, onBack, heading, subtitle, headerExtra, initialTemplateKey }: TemplatesWorkspaceProps) => {
  const { toast } = useToast();

  const [gov, setGov] = useState<Record<string, string> | null>(null);
  const [govLoading, setGovLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Все");
  const [ed, setEd] = useState<EditorState | null>(null);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);

  const [editText, setEditText] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  // Загрузка «Моих шаблонов» из базы + разовый перенос старых записей из
  // localStorage (см. lib/userTemplates.ts). Раньше список читался прямо из
  // браузера и терялся вместе с кэшем.
  const scope: TemplateScope = LEGACY_STORAGE_KEYS[storageKey] ?? "client";
  const reloadSaved = useCallback(async () => {
    try {
      const moved = await migrateLegacyTemplates(storageKey, scope);
      const list = await listTemplates(scope);
      setSaved(list.map(toEditorState));
      if (moved > 0) {
        toast({
          title: `Перенесено шаблонов: ${moved}`,
          description: "Раньше они хранились только в этом браузере — теперь доступны на любом устройстве.",
        });
      }
    } catch (e) {
      // Не блокируем работу с каталогом: шаблоны — вспомогательная функция.
      console.error("[TemplatesWorkspace] не удалось загрузить шаблоны:", e);
    }
  }, [storageKey, scope, toast]);

  useEffect(() => { void reloadSaved(); }, [reloadSaved]);

  // Смена клиента (новый профиль) при ОТКРЫТОМ редакторе: дозаполняем ПУСТЫЕ поля
  // данными выбранного клиента, ручной ввод не затираем. Редактор не пересобирается,
  // поэтому работа над шаблоном не теряется. Адресные гос-поля прошлого клиента
  // сбрасываем (их заново находит «Гос-структуры по адресу»).
  const prevProfileRef = useRef(profile);
  useEffect(() => {
    if (prevProfileRef.current === profile) return;
    prevProfileRef.current = profile;
    setGov(null);
    setEd((e) => {
      if (!e) return e;
      const ctx: FillContext = { profile, gov: null, email, today: todayRu() };
      return { ...e, fields: e.fields.map((f) => (f.value.trim() ? f : { ...f, value: autofillValue(f.key, ctx) || f.value })) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fillCtx = (): FillContext => ({ profile, gov, email, today: todayRu() });

  // Превью: отключённые («затенённые») поля исключаются из документа — их токены
  // рендерятся пустыми; активные подставляют значения.
  const previewText = useMemo(() => {
    if (!ed) return "";
    let body = ed.bodyTemplate;
    for (const f of ed.fields) {
      if (f.disabled) body = body.replace(new RegExp(`\\{\\{\\s*${f.key}\\s*\\}\\}`, "g"), "");
    }
    const active = Object.fromEntries(ed.fields.filter((f) => !f.disabled).map((f) => [f.key, f.value]));
    return renderTemplate(body, active);
  }, [ed]);

  const openTemplate = (t: DocTemplate) => {
    const ctx = fillCtx();
    const fields: EditorField[] = extractTokens(t.bodyTemplate).map((k, i) => ({
      id: `${k}-${i}`, key: k, label: fieldLabel(k),
      value: autofillValue(k, ctx) || t.defaults?.[k] || "",
      multiline: !!FIELD_DEFS[k]?.multiline,
    }));
    setEd({ savedId: null, baseKey: t.key, title: t.title, category: t.category, fields, bodyTemplate: t.bodyTemplate, format: { ...DEFAULT_FORMAT }, tables: [] });
    setEditText(false);
  };

  // Deep-link «?template=<key>»: открываем шаблон один раз при монтировании.
  // Ref, а не флаг в state, — чтобы повторный рендер не переоткрывал редактор
  // поверх начатой работы.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || !initialTemplateKey) return;
    const tpl = DOC_TEMPLATES.find((t) => t.key === initialTemplateKey);
    if (!tpl) return;
    deepLinkDoneRef.current = true;
    openTemplate(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateKey]);

  // «Мой шаблон»: пустой редактор — юрист собирает документ полностью сам
  // (свой текст, поля и таблицы). Данные клиента подставляются через селектор.
  const openBlank = () => {
    setEd({
      savedId: null, baseKey: null, title: "Мой шаблон", category: "Свои шаблоны",
      fields: [], bodyTemplate: "", format: { ...DEFAULT_FORMAT }, tables: [],
    });
    setEditText(true);
  };

  // Конструктор: тот же пустой редактор, но каркас документа собран из блоков —
  // с правильными реквизитами, правовым основанием и порядком частей. Поля
  // выводятся из токенов собранного текста, как и у обычного шаблона.
  const [builderOpen, setBuilderOpen] = useState(false);
  const composeFromBlocks = (body: string) => {
    const ctx = fillCtx();
    const fields: EditorField[] = extractTokens(body).map((k, i) => ({
      id: `${k}-${i}`, key: k, label: fieldLabel(k),
      value: autofillValue(k, ctx) || "",
      multiline: !!FIELD_DEFS[k]?.multiline,
    }));
    setEd({
      savedId: null, baseKey: null, title: "Мой документ", category: "Свои шаблоны",
      fields, bodyTemplate: body, format: { ...DEFAULT_FORMAT }, tables: [],
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
    toast({ title: filled ? `Заполнено полей: ${filled}` : "Нечего заполнять", description: filled ? "Данные подставлены автоматически" : "Все доступные поля уже заполнены или нет данных." });
  };

  const findGov = async () => {
    if (!profile?.registration_address && !profile?.city) {
      toast({ title: "Нет адреса", description: "Нужны город и адрес регистрации.", variant: "destructive" });
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
        const ctx: FillContext = { profile, gov: s, email, today: todayRu() };
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

  const addField = (key: string, label: string) => {
    if (!ed) return;
    const ctx = fillCtx();
    const field: EditorField = { id: newId(), key, label: label || fieldLabel(key), value: autofillValue(key, ctx), multiline: !!FIELD_DEFS[key]?.multiline };
    patch({ fields: [...ed.fields, field] });
    setAddFieldOpen(false);
    toast({ title: "Поле добавлено", description: `«${field.label}». Нажмите «в текст», чтобы вставить в документ.` });
  };
  // «Удаление» поля = мягкое отключение: поле остаётся в списке (затенённым) и
  // исключается из документа; можно вернуть обратно. Токен в тексте сохраняется.
  const toggleFieldDisabled = (id: string) =>
    setEd((e) => (e ? { ...e, fields: e.fields.map((f) => (f.id === id ? { ...f, disabled: !f.disabled } : f)) } : e));
  const insertToken = (key: string) => {
    if (!ed) return;
    const sep = ed.bodyTemplate.endsWith("\n") ? "" : "\n";
    patch({ bodyTemplate: `${ed.bodyTemplate}${sep}{{${key}}}` });
    toast({ title: "Вставлено в текст", description: `{{${key}}} добавлено в конец документа.` });
  };

  const insertDocs = (listStr: string, count: number) => {
    if (!ed || !listStr.trim()) { setDocsOpen(false); return; }
    const target = ed.fields.find((f) => /docs|exam/.test(f.key) && !f.disabled);
    if (target) {
      const merged = target.value.trim() ? `${target.value.trim()}\n${listStr}` : listStr;
      setField(target.id, merged);
    } else {
      const field: EditorField = { id: newId(), key: "docs_list", label: "Перечень прилагаемых документов", value: listStr, multiline: true };
      patch({ fields: [...ed.fields, field] });
      insertToken("docs_list");
    }
    setDocsOpen(false);
    toast({ title: "Документы вставлены", description: `${count} шт. добавлено в перечень.` });
  };

  const addTable = () => { if (ed) patch({ tables: [...ed.tables, { headerRow: true, rows: [["Колонка 1", "Колонка 2"], ["", ""]] }] }); };
  const updateTable = (idx: number, t: DocTable) => setEd((e) => (e ? { ...e, tables: e.tables.map((x, i) => (i === idx ? t : x)) } : e));
  const removeTable = (idx: number) => setEd((e) => (e ? { ...e, tables: e.tables.filter((_, i) => i !== idx) } : e));

  const [savingTpl, setSavingTpl] = useState(false);

  const saveTemplate = async () => {
    if (!ed || savingTpl) return;
    setSavingTpl(true);
    try {
      const rec = await persistTemplate({
        id: ed.savedId,
        scope,
        title: ed.title,
        category: ed.category,
        bodyTemplate: ed.bodyTemplate,
        fields: ed.fields,
        tables: ed.tables,
        format: ed.format as unknown as Record<string, unknown>,
        baseKey: ed.baseKey,
      });
      patch({ savedId: rec.id });
      await reloadSaved();
      toast({ title: "Шаблон сохранён", description: "Доступен в «Мои шаблоны» с любого устройства." });
    } catch (e) {
      toast({
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз.",
        variant: "destructive",
      });
    } finally {
      setSavingTpl(false);
    }
  };

  const deleteSaved = async (id: string) => {
    // Оптимистично убираем из списка, при ошибке возвращаем — иначе исчезнувший
    // и снова появившийся шаблон выглядит как сбой.
    const prev = saved;
    setSaved(saved.filter((s) => s.id !== id));
    try {
      await removeTemplate(id);
    } catch (e) {
      setSaved(prev);
      toast({
        title: "Не удалось удалить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз.",
        variant: "destructive",
      });
    }
  };

  const exportDocx = async () => {
    if (!ed) return;
    try {
      await downloadDocx({ title: ed.title, text: previewText, tables: ed.tables, format: ed.format });
      toast({ title: "DOCX скачан", description: "Файл откроется в Word/LibreOffice." });
    } catch (e) {
      toast({ title: "Ошибка экспорта", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  const exportPrint = () => { if (ed) printDoc({ title: ed.title, text: previewText, tables: ed.tables, format: ed.format }); };

  // PDF отдельным файлом, а не через диалог печати: у каждого браузера он свой,
  // на мобильных часто отсутствует, а колонтитулы браузера норовят попасть в
  // документ. Шрифт и jsPDF грузятся лениво (~400 КБ), поэтому показываем
  // индикатор — первая генерация не мгновенная.
  const [pdfBusy, setPdfBusy] = useState(false);
  const exportPdf = async () => {
    if (!ed || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { downloadPdf } = await import("@/lib/pdfBuilder");
      await downloadPdf({ title: ed.title, text: previewText, tables: ed.tables, format: ed.format });
      toast({ title: "PDF скачан", description: "Готов к печати и отправке." });
    } catch (e) {
      toast({
        title: "Не удалось собрать PDF",
        description: e instanceof Error ? e.message : "Попробуйте «Печать» — там тоже есть сохранение в PDF.",
        variant: "destructive",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const unusedFieldKeys = useMemo(() => {
    const used = new Set(ed?.fields.map((f) => f.key) || []);
    return Object.keys(FIELD_DEFS).filter((k) => !used.has(k));
  }, [ed]);

  const dialogs = (
    <>
      <AddFieldDialog open={addFieldOpen} onOpenChange={setAddFieldOpen} unusedKeys={unusedFieldKeys} onAdd={addField} />
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Документы в перечень приложений</DialogTitle>
            <DialogDescription>
              Отметьте галочками документы — они добавятся в «Приложения». «Кем выдан / организацию»
              при необходимости впишите в таблице.
            </DialogDescription>
          </DialogHeader>
          <DocsPicker docs={docs} onInsert={insertDocs} />
        </DialogContent>
      </Dialog>
      <SavedDialog open={savedOpen} onOpenChange={setSavedOpen} saved={saved} onOpen={openSaved} onDelete={deleteSaved} />
      <DocumentBlockBuilder open={builderOpen} onOpenChange={setBuilderOpen} onCompose={composeFromBlocks} />
    </>
  );

  // ── Каталог ───────────────────────────────────────────────────────────────
  if (!ed) {
    const filtered = DOC_TEMPLATES.filter((t) => {
      if (cat !== "Все" && t.category !== cat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    });
    return (
      <>
        <main className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-5xl">
            <Button variant="ghost" onClick={onBack} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Назад
            </Button>

            <div className="mb-4">
              <h1 className="text-2xl font-bold md:text-3xl">{heading || "Шаблоны документов"}</h1>
              <p className="mt-1 text-muted-foreground">
                {subtitle || "Выберите шаблон — поля заполнятся из профиля, военкоматы и диспансеры найдём по адресу. Документ можно отредактировать и скачать в DOCX или распечатать."}
              </p>
            </div>

            {headerExtra}

            {/* «Мои шаблоны»: первая карточка — «Мой шаблон» (создать с нуля),
                рядом — уже сохранённые. После создания первого слот «Мой шаблон»
                остаётся → всегда можно сделать ещё один. Прячем при поиске
                (поиск работает по готовым шаблонам). */}
            {!search.trim() && (
              <section className="mb-8 mt-4">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Мои шаблоны</h2>
                  {saved.length > 0 && <Badge variant="secondary">{saved.length}</Badge>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Конструктор стоит ПЕРЕД «с нуля»: для большинства задач
                      собрать каркас из готовых частей быстрее и надёжнее, чем
                      писать документ с чистого листа и вспоминать нормы. */}
                  <button
                    onClick={() => setBuilderOpen(true)}
                    className="flex flex-col items-start gap-2 rounded-lg border-2 border-primary/50 bg-primary/[0.05] p-5 text-left transition-colors hover:border-primary hover:bg-primary/[0.09]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Blocks className="h-5 w-5" />
                    </span>
                    <span className="font-semibold">Собрать из блоков</span>
                    <span className="text-sm text-muted-foreground">
                      Шапка, основание, просительная часть, приложения — отметьте нужные части,
                      порядок выставится сам. Правовые основания из библиотеки.
                    </span>
                  </button>

                  <button
                    onClick={openBlank}
                    className="flex flex-col items-start gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/[0.03] p-5 text-left transition-colors hover:border-primary hover:bg-primary/[0.06]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FilePlus2 className="h-5 w-5" />
                    </span>
                    <span className="font-semibold">Чистый лист</span>
                    <span className="text-sm text-muted-foreground">
                      Свой текст, поля и таблицы с нуля. Данные клиента подставятся из меню
                      выбора клиента выше.
                    </span>
                  </button>
                  {saved.map((s) => (
                    <Card key={s.id} className="flex flex-col transition-shadow hover:shadow-md">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-3">
                            <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                            <div className="min-w-0">
                              <CardTitle className="break-words text-base leading-tight">{s.title || "Без названия"}</CardTitle>
                              <span className="text-xs text-muted-foreground">
                                Изменён {new Date(s.savedAt).toLocaleDateString("ru-RU")}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteSaved(s.id)}
                            className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                            title="Удалить шаблон"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent className="mt-auto">
                        <Button variant="outline" className="w-full" onClick={() => openSaved(s)}>
                          <Pencil className="mr-2 h-4 w-4" /> Открыть
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Сохранённые шаблоны хранятся в этом браузере.</p>
              </section>
            )}

            <h2 className="mb-3 mt-4 text-lg font-semibold">Готовые шаблоны</h2>

            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск шаблона…" className="pl-9" />
              </div>
              {saved.length > 0 && search.trim() && (
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
        {dialogs}
      </>
    );
  }

  // ── Редактор ──────────────────────────────────────────────────────────────
  return (
    <>
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setEd(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> К шаблонам
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={saveTemplate} disabled={savingTpl}>
                {savingTpl ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Сохранить
              </Button>
              <Button variant="outline" size="sm" onClick={exportPrint}><Printer className="mr-1.5 h-4 w-4" /> Печать</Button>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
                PDF
              </Button>
              <Button size="sm" onClick={exportDocx}><Download className="mr-1.5 h-4 w-4" /> Скачать DOCX</Button>
            </div>
          </div>

          {/* Селектор клиента доступен и в редакторе: выбор клиента дозаполняет
              пустые поля его данными (см. эффект по profile выше). */}
          {headerExtra}

          <Input
            value={ed.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="mb-4 h-auto border-0 border-b border-border/60 px-0 text-lg font-semibold focus-visible:ring-0"
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={autofillFromProfile}><Sparkles className="mr-1.5 h-4 w-4" /> Из профиля</Button>
                <Button variant="outline" size="sm" onClick={findGov} disabled={govLoading}>
                  {govLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MapPin className="mr-1.5 h-4 w-4" />} Гос-структуры
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDocsOpen(true)} disabled={!docs.length}><FilePlus2 className="mr-1.5 h-4 w-4" /> Документы</Button>
                <Button variant="outline" size="sm" onClick={() => setShowFormat((v) => !v)}><Settings2 className="mr-1.5 h-4 w-4" /> Формат</Button>
              </div>

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
                        <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Размер, pt</Label>
                      <Select value={String(ed.format.fontSizePt)} onValueChange={(v) => patch({ format: { ...ed.format, fontSizePt: Number(v) } })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Поля документа</CardTitle>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setAddFieldOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Поле</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ed.fields.length === 0 && <p className="text-sm text-muted-foreground">Полей нет. Добавьте поле или редактируйте текст.</p>}
                  {ed.fields.map((f) => (
                    <div key={f.id} className={cn("group", f.disabled && "opacity-50")}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Label className={cn("min-w-0 truncate text-xs text-muted-foreground", f.disabled && "line-through")}>
                          {f.label}{f.disabled && <span className="ml-1 no-underline">(убрано)</span>}
                        </Label>
                        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          {!f.disabled && (
                            <button onClick={() => insertToken(f.key)} className="rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10" title="Вставить {{поле}} в текст">в текст</button>
                          )}
                          {f.disabled ? (
                            <button onClick={() => toggleFieldDisabled(f.id)} className="rounded p-1 text-muted-foreground hover:text-emerald-600" title="Вернуть поле в документ"><RotateCcw className="h-3.5 w-3.5" /></button>
                          ) : (
                            <button onClick={() => toggleFieldDisabled(f.id)} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Убрать поле из документа"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </div>
                      {f.multiline
                        ? <Textarea value={f.value} disabled={f.disabled} onChange={(e) => setField(f.id, e.target.value)} rows={3} placeholder={FIELD_DEFS[f.key]?.placeholder} />
                        : <Input value={f.value} disabled={f.disabled} onChange={(e) => setField(f.id, e.target.value)} placeholder={FIELD_DEFS[f.key]?.placeholder} />}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><TableIcon className="h-4 w-4" /> Таблицы</CardTitle>
                  <Button variant="outline" size="sm" className="h-8" onClick={addTable}><Plus className="mr-1 h-3.5 w-3.5" /> Таблица</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ed.tables.length === 0 && <p className="text-sm text-muted-foreground">Таблиц нет. Добавьте при необходимости (приложения, опись).</p>}
                  {ed.tables.map((t, i) => <TableEditor key={i} table={t} onChange={(nt) => updateTable(i, nt)} onRemove={() => removeTable(i)} />)}
                </CardContent>
              </Card>

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
                      Токены вида <code className="rounded bg-muted px-1">{"{{поле}}"}</code> подставляются значениями полей. Текст можно свободно менять.
                    </p>
                    {/* Без этой шпаргалки о блоках никто не узнает: синтаксис
                        нигде больше не описан, а именно он избавляет от
                        заведения отдельного шаблона под каждый вариант. */}
                    <details className="mb-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-medium text-foreground">
                        Условные блоки и списки
                      </summary>
                      <div className="mt-2 space-y-2 text-muted-foreground">
                        <p>
                          Абзац появится, только если поле заполнено:
                          <code className="mt-1 block whitespace-pre rounded bg-background px-2 py-1 text-[11px]">
                            {"{{#if study_org}}\nОбучаюсь в {{study_org}}.\n{{/if}}"}
                          </code>
                        </p>
                        <p>
                          Наоборот — если поле пустое:
                          <code className="mt-1 block whitespace-pre rounded bg-background px-2 py-1 text-[11px]">
                            {"{{#unless docs_list}}\nДокументы будут представлены дополнительно.\n{{/unless}}"}
                          </code>
                        </p>
                        <p>
                          Нумерованный список из многострочного поля:
                          <code className="mt-1 block whitespace-pre rounded bg-background px-2 py-1 text-[11px]">
                            {"{{#each docs_list}}{{@index}}. {{this}}{{/each}}"}
                          </code>
                        </p>
                        <p className="text-[11px]">
                          Поле считается заполненным, если в нём есть хоть один непробельный символ.
                          Блоки можно вкладывать друг в друга.
                        </p>
                      </div>
                    </details>
                    <Textarea value={ed.bodyTemplate} onChange={(e) => patch({ bodyTemplate: e.target.value })} rows={14} className="font-mono text-xs leading-relaxed" />
                  </CardContent>
                )}
              </Card>
            </div>

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
      {dialogs}
    </>
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
        if (!titleDone) return <p key={i} className="mb-2 text-center italic">{trimmed || " "}</p>;
        return <p key={i} className="mb-1.5 whitespace-pre-wrap text-justify">{line || " "}</p>;
      })}
      {tables.filter((t) => t.rows.length).map((t, ti) => (
        <table key={ti} className="my-3 w-full border-collapse">
          <tbody>
            {t.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) =>
                  t.headerRow && ri === 0
                    ? <th key={ci} className="border border-black px-2 py-1 text-left font-bold">{c}</th>
                    : <td key={ci} className="border border-black px-2 py-1 align-top">{c || " "}</td>,
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
          <DialogDescription>Выберите готовое поле (заполнится автоматически) или создайте своё.</DialogDescription>
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
                onClick={() => { onAdd(`custom_${Math.random().toString(36).slice(2, 7)}`, customLabel.trim()); setCustomLabel(""); }}
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
function DocsPicker({ docs, onInsert }: { docs: DocItem[]; onInsert: (listStr: string, count: number) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [issuers, setIssuers] = useState<Record<string, string>>({});
  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = docs.length > 0 && sel.size === docs.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(docs.map((d) => d.id)));

  const build = () => {
    const chosen = docs.filter((d) => sel.has(d.id));
    const lines = chosen
      .map((d, i) => {
        const meta: string[] = [];
        if (d.document_date) meta.push(`от ${new Date(d.document_date).toLocaleDateString("ru-RU")}`);
        const issuer = (issuers[d.id] ?? d.issuer ?? "").trim();
        if (issuer) meta.push(issuer);
        return `${i + 1}. ${d.title || "Документ"}${meta.length ? ` — ${meta.join(" — ")}` : ""}`;
      })
      .join("\n");
    onInsert(lines, chosen.length);
  };

  return (
    <>
      {docs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Нет доступных документов.</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left">
                <th className="p-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Выбрать все" /></th>
                <th className="p-2 font-medium">Документ</th>
                <th className="whitespace-nowrap p-2 font-medium">Дата</th>
                <th className="p-2 font-medium">Тип</th>
                <th className="p-2 font-medium">Кем выдан / организация</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t align-top hover:bg-muted/30">
                  <td className="p-2"><Checkbox checked={sel.has(d.id)} onCheckedChange={() => toggle(d.id)} /></td>
                  <td className="p-2"><span className="block max-w-[220px] break-words font-medium leading-tight">{d.title || "Без названия"}</span></td>
                  <td className="whitespace-nowrap p-2 text-muted-foreground">{d.document_date ? new Date(d.document_date).toLocaleDateString("ru-RU") : "—"}</td>
                  <td className="p-2 text-muted-foreground">{d.typeName || "—"}</td>
                  <td className="p-2">
                    <Input
                      value={issuers[d.id] ?? d.issuer ?? ""}
                      onChange={(e) => setIssuers((m) => ({ ...m, [d.id]: e.target.value }))}
                      placeholder="организация / кем выдан"
                      className="h-8 min-w-[150px] text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DialogFooter className="mt-3">
        <Button disabled={!sel.size} onClick={build}>Вставить в перечень ({sel.size})</Button>
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

export default TemplatesWorkspace;
