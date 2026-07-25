import { useMemo, useState } from "react";
import { Blocks, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  blocksOfKind, composeDocument, KIND_LABELS, KIND_ORDER, type BlockKind,
} from "@/lib/documentBlocks";

// ════════════════════════════════════════════════════════════════════════
//  Конструктор документа из блоков (§5).
//
//  Раньше «Мой шаблон» открывал пустое поле — юрист писал с нуля или копировал
//  куски из готовых документов. Здесь он отмечает нужные части, видит
//  предпросмотр и получает готовый каркас с правильными правовыми основаниями.
//
//  Результат — обычный текст шаблона: дальше работают предпросмотр, DOCX, PDF,
//  печать и условные блоки, ничего специального.
// ════════════════════════════════════════════════════════════════════════

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Готовый текст шаблона. */
  onCompose: (body: string) => void;
}

/** Части, без которых документ не документ. */
const REQUIRED_KINDS: BlockKind[] = ["addressee", "title", "demand"];

const DocumentBlockBuilder = ({ open, onOpenChange, onCompose }: Props) => {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string, kind: BlockKind) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Шапка, заголовок и подпись — по одной штуке: два заголовка в одном
      // документе это не выбор пользователя, а ошибка.
      const single: BlockKind[] = ["addressee", "title", "signature"];
      if (single.includes(kind)) {
        const sameKind = blocksOfKind(kind).map((b) => b.id);
        return [...prev.filter((x) => !sameKind.includes(x)), id];
      }
      return [...prev, id];
    });
  };

  const preview = useMemo(() => composeDocument(selected), [selected]);

  const missing = useMemo(
    () => REQUIRED_KINDS.filter((k) => !selected.some((id) => blocksOfKind(k).some((b) => b.id === id))),
    [selected],
  );

  const handleInsert = () => {
    onCompose(preview);
    setSelected([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blocks className="h-5 w-5" /> Собрать документ из блоков
          </DialogTitle>
          <DialogDescription>
            Отметьте нужные части — порядок в документе выставится сам. Правовые основания
            взяты из формулировок действующих шаблонов. Текст останется полностью редактируемым.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-2">
          {/* Выбор блоков */}
          <div className="overflow-y-auto pr-1 space-y-5">
            {KIND_ORDER.map((kind) => {
              const items = blocksOfKind(kind);
              if (!items.length) return null;
              const isMissing = missing.includes(kind);
              return (
                <section key={kind}>
                  <h3
                    className={cn(
                      "mb-2 text-xs font-semibold uppercase tracking-wide",
                      isMissing ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {KIND_LABELS[kind]}
                    {REQUIRED_KINDS.includes(kind) && " · обязательно"}
                  </h3>
                  <div className="space-y-1.5">
                    {items.map((b) => {
                      const checked = selected.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors",
                            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(b.id, b.kind)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{b.label}</span>
                            {b.hint && (
                              <span className="block text-xs text-muted-foreground mt-0.5">{b.hint}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Предпросмотр */}
          <div className="flex flex-col min-h-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Предпросмотр каркаса
            </p>
            <div className="flex-1 overflow-y-auto rounded-lg border bg-white p-4 text-black dark:bg-neutral-100">
              {preview ? (
                <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed">{preview}</pre>
              ) : (
                <p className="text-sm text-neutral-500">
                  Отметьте блоки слева — здесь появится каркас документа.
                </p>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Токены вида {"{{поле}}"} превратятся в поля формы — их значения подставятся
              из профиля.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {missing.length
              ? `Не хватает: ${missing.map((k) => KIND_LABELS[k].toLowerCase()).join(", ")}`
              : "Каркас готов — можно вставлять и править текст."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected([])} disabled={!selected.length}>
              Сбросить
            </Button>
            <Button onClick={handleInsert} disabled={!preview || missing.length > 0}>
              <Check className="mr-1.5 h-4 w-4" /> Собрать документ
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentBlockBuilder;
