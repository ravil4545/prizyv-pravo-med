import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, FileUp, Image as ImageIcon, Camera, Check, X, Plus,
  Loader2, Trash2, Brain, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fileToPages, pagesToPdfBlob, buildPreviewThumbnail, type MergedPageImage } from "@/lib/documentMerger";

export interface DocumentUploadResult {
  /** Один PDF-блоб со всеми страницами этого документа */
  blob: Blob;
  /** Название, которое юзер дал документу (или auto) */
  title: string;
  /** Количество РЕАЛЬНЫХ страниц после раскрытия многостраничных PDF */
  pages: number;
  /** Исходные файлы — родитель может извлечь raw_text если хочет */
  sourceFiles: File[];
  /** Base64 первой страницы (для запуска AI-анализа на стороне родителя) */
  firstPageBase64?: string;
}

/** Что родитель возвращает из onUpload — позволяет показать в слоте
 *  анимацию «ИИ-анализ» и потом итог по категории, не блокируя переход к
 *  следующему слоту. */
export interface UploadAck {
  /** Промис, который завершится когда AI-анализ документа закончится.
   *  Пока он не зарезолвлен — в слоте видна анимация Brain + «ИИ анализирует». */
  analysisPromise?: Promise<{
    category?: string | null;
    explanation?: string | null;
  } | void>;
}

interface DocumentUploadWizardProps {
  /** Callback вызывается после того, как юзер собрал документ (склейка PDF готова).
   *  Должен ВЫПОЛНИТЬ upload в Storage + insert в БД синхронно (await),
   *  и опционально вернуть { analysisPromise } — wizard покажет анимацию
   *  анализа внутри слота и переключится на следующий, не дожидаясь. */
  onUpload: (result: DocumentUploadResult) => Promise<UploadAck | void>;
  /** Стартовое число слотов. По умолчанию 3 (как в требовании). */
  initialSlots?: number;
  /** Подсказка-описание над виджетом */
  hint?: string;
  /** Заблокировать новые загрузки (например лимит исчерпан) */
  disabled?: boolean;
  /** Текст блокировки */
  disabledReason?: string;
}

type SlotStatus =
  | { kind: "empty" }                                  // ничего не выбрано
  | { kind: "selecting"; files: File[]; thumbs: string[]; title: string } // юзер набирает страницы
  | { kind: "uploading"; progress: string }            // склейка / загрузка
  | {
      kind: "done";
      title: string;
      pages: number;
      analyzing: boolean;                              // ИИ ещё работает над документом
      category?: string | null;                        // итоговая категория годности (после анализа)
      explanation?: string | null;                     // короткое пояснение (после анализа)
    };

interface Slot {
  id: string;
  status: SlotStatus;
}

const newSlot = (): Slot => ({
  id: Math.random().toString(36).slice(2, 10),
  status: { kind: "empty" },
});

/**
 * Мастер загрузки документов с пошаговой схемой:
 *   • Ряд слотов-документов (по умолчанию 3). Активен один — следующий после
 *     завершения предыдущего.
 *   • На активном слоте — три способа набора страниц: PDF, фото, камера.
 *   • Все выбранные страницы склеиваются в один PDF на клиенте перед upload.
 *   • После 3 слотов появляется кнопка «+ Добавить документ».
 *
 * Родитель получает готовый PDF-blob через onUpload — туда же передаём
 * метаданные (title, pages, исходники).
 */
const DocumentUploadWizard = ({
  onUpload,
  initialSlots = 3,
  hint,
  disabled = false,
  disabledReason,
}: DocumentUploadWizardProps) => {
  const { toast } = useToast();
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: Math.max(1, initialSlots) }, () => newSlot()),
  );
  const [activeIdx, setActiveIdx] = useState(0);

  // Hidden inputs — по одному на каждый способ ввода
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Активный слот всегда определяется как первый «не done», иначе последний
  useEffect(() => {
    const firstNotDone = slots.findIndex((s) => s.status.kind !== "done");
    if (firstNotDone >= 0 && firstNotDone !== activeIdx) setActiveIdx(firstNotDone);
    if (firstNotDone < 0) setActiveIdx(slots.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const updateSlot = (idx: number, updater: (s: Slot) => Slot) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? updater(s) : s)));
  };

  const addNewSlot = () => {
    setSlots((prev) => [...prev, newSlot()]);
  };

  // ── Обработка выбора файлов (PDF / фото / камера) ────────────────────
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const slot = slots[activeIdx];
      if (!slot || slot.status.kind === "uploading" || slot.status.kind === "done") return;

      const incoming = Array.from(files);
      // На лету генерируем превью для каждой добавленной страницы. Если PDF —
      // одна миниатюра первой страницы (но при склейке всё его страницы попадут).
      const newThumbs: string[] = [];
      for (const f of incoming) {
        try {
          const t = await buildPreviewThumbnail(f);
          newThumbs.push(t);
        } catch {
          newThumbs.push(""); // ОК, без миниатюры
        }
      }

      updateSlot(activeIdx, (s) => {
        const prev = s.status.kind === "selecting" ? s.status : { files: [] as File[], thumbs: [] as string[], title: "" };
        const mergedFiles = [...prev.files, ...incoming];
        const mergedThumbs = [...prev.thumbs, ...newThumbs];
        // Авто-заголовок документа — первое имя файла без расширения
        const autoTitle = prev.title || mergedFiles[0]?.name.replace(/\.[^/.]+$/, "") || "Документ";
        return { ...s, status: { kind: "selecting", files: mergedFiles, thumbs: mergedThumbs, title: autoTitle } };
      });
    },
    [activeIdx, slots],
  );

  const removePage = (slotIdx: number, pageIdx: number) => {
    updateSlot(slotIdx, (s) => {
      if (s.status.kind !== "selecting") return s;
      const files = s.status.files.filter((_, i) => i !== pageIdx);
      const thumbs = s.status.thumbs.filter((_, i) => i !== pageIdx);
      if (files.length === 0) return { ...s, status: { kind: "empty" } };
      return { ...s, status: { ...s.status, files, thumbs } };
    });
  };

  const cancelSlot = (slotIdx: number) => {
    updateSlot(slotIdx, (s) => ({ ...s, status: { kind: "empty" } }));
  };

  const renameSlot = (slotIdx: number, title: string) => {
    updateSlot(slotIdx, (s) => {
      if (s.status.kind !== "selecting") return s;
      return { ...s, status: { ...s.status, title } };
    });
  };

  // ── Финальная склейка + вызов родителя ───────────────────────────────
  const finishSlot = async (slotIdx: number) => {
    const slot = slots[slotIdx];
    if (!slot || slot.status.kind !== "selecting") return;
    const { files, title } = slot.status;
    if (files.length === 0) return;

    updateSlot(slotIdx, (s) => ({ ...s, status: { kind: "uploading", progress: "Сборка PDF…" } }));

    try {
      // Разворачиваем все файлы в массив страниц (PDF → постранично, фото → 1 страница)
      const allPages: MergedPageImage[] = [];
      for (let i = 0; i < files.length; i++) {
        updateSlot(slotIdx, (s) =>
          s.status.kind === "uploading"
            ? { ...s, status: { kind: "uploading", progress: `Обработка «${files[i].name}» (${i + 1}/${files.length})…` } }
            : s,
        );
        const pages = await fileToPages(files[i]);
        allPages.push(...pages);
      }

      updateSlot(slotIdx, (s) =>
        s.status.kind === "uploading"
          ? { ...s, status: { kind: "uploading", progress: "Сборка PDF…" } }
          : s,
      );
      const blob = pagesToPdfBlob(allPages);

      updateSlot(slotIdx, (s) =>
        s.status.kind === "uploading"
          ? { ...s, status: { kind: "uploading", progress: "Загрузка…" } }
          : s,
      );

      // Передаём родителю — он отвечает за upload в Storage и insert в БД,
      // и может вернуть analysisPromise (тогда покажем анимацию ИИ-анализа
      // прямо в слоте, не блокируя переход к следующему документу).
      const ack = await onUpload({
        blob,
        title: title.trim() || `Документ_${new Date().toISOString().slice(0, 10)}`,
        pages: allPages.length,
        sourceFiles: files,
        firstPageBase64: allPages[0]?.base64,
      });

      const finalTitle = title.trim() || "Документ";
      const hasAnalysis = !!ack?.analysisPromise;

      updateSlot(slotIdx, (s) => ({
        ...s,
        status: {
          kind: "done",
          title: finalTitle,
          pages: allPages.length,
          analyzing: hasAnalysis,
        },
      }));

      // В фоне ждём результат ИИ-анализа и подставляем его в карточку слота —
      // юзер видит финальную категорию без перехода на другие экраны.
      // Активирующий useEffect переключит фокус на следующий слот раньше.
      if (ack?.analysisPromise) {
        ack.analysisPromise
          .then((res) => {
            updateSlot(slotIdx, (s) =>
              s.status.kind === "done"
                ? {
                    ...s,
                    status: {
                      ...s.status,
                      analyzing: false,
                      category: res?.category ?? null,
                      explanation: res?.explanation ?? null,
                    },
                  }
                : s,
            );
          })
          .catch(() => {
            // Анализ упал — просто скрываем спиннер, документ всё равно загружен
            updateSlot(slotIdx, (s) =>
              s.status.kind === "done" ? { ...s, status: { ...s.status, analyzing: false } } : s,
            );
          });
      }
    } catch (e) {
      console.error("Document upload failed:", e);
      toast({
        title: "Ошибка загрузки",
        description: e instanceof Error ? e.message : "Неизвестная ошибка",
        variant: "destructive",
      });
      // Возвращаем слот в состояние «selecting» — юзер может попробовать ещё раз
      updateSlot(slotIdx, (s) => {
        if (s.status.kind === "uploading") {
          return { ...s, status: { kind: "selecting", files, thumbs: [], title } };
        }
        return s;
      });
    }
  };

  // ── Триггеры выбора источника ────────────────────────────────────────
  const trigger = (source: "pdf" | "photo" | "camera") => {
    if (disabled) {
      toast({ title: disabledReason || "Загрузка недоступна", variant: "destructive" });
      return;
    }
    if (source === "pdf") pdfInputRef.current?.click();
    if (source === "photo") photoInputRef.current?.click();
    if (source === "camera") cameraInputRef.current?.click();
  };

  // ── Render одного слота ──────────────────────────────────────────────
  const renderSlot = (slot: Slot, idx: number) => {
    const isActive = idx === activeIdx && !disabled;
    const status = slot.status;

    return (
      <div
        key={slot.id}
        className={cn(
          "rounded-2xl border-2 transition-all p-3 flex flex-col items-center text-center min-h-[170px]",
          status.kind === "done"
            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
            : isActive
            ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
            : "border-dashed border-muted-foreground/20 bg-muted/20 opacity-60",
        )}
      >
        {/* Header — порядковый номер */}
        <div className="text-[10px] font-semibold tracking-widest text-muted-foreground mb-1 uppercase">
          Документ {idx + 1}
        </div>

        {/* Состояния */}
        {status.kind === "empty" && (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <FileText
              className={cn(
                "h-14 w-14 mb-2",
                isActive ? "text-primary" : "text-muted-foreground/40",
              )}
            />
            {isActive ? (
              <div className="flex flex-col gap-1.5 w-full mt-1">
                <Button
                  size="sm"
                  variant="default"
                  className="w-full justify-start gap-2"
                  onClick={() => trigger("pdf")}
                >
                  <FileUp className="h-3.5 w-3.5" /> PDF (одна или несколько)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => trigger("photo")}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Фото из галереи
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => trigger("camera")}
                >
                  <Camera className="h-3.5 w-3.5" /> Сфотографировать
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Ждёт своей очереди</p>
            )}
          </div>
        )}

        {status.kind === "selecting" && (
          <div className="flex-1 flex flex-col w-full">
            {/* Превью миниатюр выбранных страниц */}
            <div className="flex flex-wrap gap-1.5 justify-center py-1 max-h-32 overflow-y-auto">
              {status.thumbs.map((src, i) => (
                <div key={i} className="relative group h-16 w-12 rounded-md overflow-hidden border bg-background">
                  {src ? (
                    <img src={src} alt={`Страница ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[9px] text-muted-foreground">
                      {status.files[i]?.name.slice(0, 8) || "—"}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute top-0 right-0 h-4 w-4 bg-black/60 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={() => removePage(idx, i)}
                    aria-label="Удалить страницу"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <span className="absolute bottom-0 left-0 text-[8px] bg-black/50 text-white px-1 rounded-tr">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* Имя документа */}
            <Input
              value={status.title}
              onChange={(e) => renameSlot(idx, e.target.value)}
              placeholder="Название документа"
              className="h-7 text-xs mt-2"
            />

            {/* Кнопки добавить ещё страниц / завершить / отмена */}
            <div className="flex gap-1 mt-2 flex-wrap justify-center">
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => trigger("pdf")}>
                <FileUp className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => trigger("photo")}>
                <ImageIcon className="h-3 w-3" /> Фото
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => trigger("camera")}>
                <Camera className="h-3 w-3" /> Снять
              </Button>
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
                onClick={() => cancelSlot(idx)}
              >
                <Trash2 className="h-3 w-3" /> Очистить
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-[11px] gap-1 flex-1"
                onClick={() => finishSlot(idx)}
                disabled={status.files.length === 0}
              >
                <Check className="h-3 w-3" /> Готово · {status.files.length} стр.
              </Button>
            </div>
          </div>
        )}

        {status.kind === "uploading" && (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-2" />
            <p className="text-xs text-muted-foreground px-2">{status.progress}</p>
          </div>
        )}

        {status.kind === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            {/* Иконка документа: emerald = загружен; на ней либо галочка
                (анализ закончен), либо вертушка Brain (ИИ ещё работает). */}
            <div className="relative">
              <FileText className="h-14 w-14 text-emerald-600" />
              <div
                className={cn(
                  "absolute -bottom-1 -right-1 rounded-full h-6 w-6 flex items-center justify-center border-2 border-white",
                  status.analyzing ? "bg-violet-500" : "bg-emerald-500",
                )}
              >
                {status.analyzing ? (
                  <Brain className="h-3.5 w-3.5 text-white animate-pulse" strokeWidth={2.5} />
                ) : (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                )}
              </div>
            </div>
            <p className="text-xs font-medium mt-2 truncate w-full px-2" title={status.title}>
              {status.title}
            </p>
            <p className="text-[10px] text-muted-foreground">Загружен · {status.pages} стр.</p>

            {/* Анимация анализа — пока ИИ работает, занимает место итога */}
            {status.analyzing && (
              <div className="mt-2 rounded-lg bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 px-2 py-1.5 w-full flex items-center justify-center gap-1.5 border border-violet-200/60 dark:border-violet-900/40">
                <Sparkles className="h-3 w-3 text-violet-500 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-medium bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                  ИИ анализирует…
                </span>
              </div>
            )}

            {/* Результат анализа — категория и короткое пояснение */}
            {!status.analyzing && status.category && (
              <div className="mt-2 w-full flex flex-col items-center gap-1">
                <Badge className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-0">
                  Категория: {status.category}
                </Badge>
                {status.explanation && (
                  <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2 px-1" title={status.explanation}>
                    {status.explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        {hint && (
          <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
        )}
        {disabled && disabledReason && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2 py-1.5">
            {disabledReason}
          </p>
        )}

        {/* Сетка слотов: 3 в ряд на десктопе, 2 на планшете, 1 на мобиле */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {slots.map((slot, idx) => renderSlot(slot, idx))}
        </div>

        {/* Кнопка добавить ещё один документ — видна всегда после ряда слотов,
            как и просил пользователь. Расширяет сетку вниз. */}
        {!disabled && (
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-dashed"
              onClick={addNewSlot}
            >
              <Plus className="h-4 w-4" /> Добавить документ
            </Button>
          </div>
        )}

        {/* Скрытые inputs — общие для всех слотов; активный слот определяется через activeIdx */}
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          // capture="environment" просит мобильный браузер открыть тыловую камеру.
          // На десктопе атрибут игнорируется — будет обычный file picker.
          capture="environment"
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
};

export default DocumentUploadWizard;
