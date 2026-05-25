export type OcrLevel = "high" | "medium" | "low" | "none";

export interface OcrQuality {
  level: OcrLevel;
  label: string;
  advice: string | null;
  charCount: number;
}

const ARTIFACT_RATIO_THRESHOLD = 0.55;

const calcArtifactRatio = (text: string): number => {
  const cleaned = text.replace(/\s+/g, "");
  if (cleaned.length === 0) return 1;
  const letters = (cleaned.match(/[\p{L}]/gu) || []).length;
  return 1 - letters / cleaned.length;
};

export function getOcrQuality(rawText: string | null | undefined, isClassified: boolean): OcrQuality | null {
  if (!isClassified) return null;

  const text = (rawText || "").trim();
  const charCount = text.length;

  if (charCount === 0) {
    return {
      level: "none",
      label: "Текст не распознан",
      advice: "ИИ не смог извлечь текст. Введите его вручную для точного анализа.",
      charCount: 0,
    };
  }

  if (charCount < 80) {
    return {
      level: "low",
      label: "Мало текста распознано",
      advice: "Извлечено очень мало текста. Уточните данные вручную.",
      charCount,
    };
  }

  const artifactRatio = calcArtifactRatio(text);

  if (charCount < 200 || artifactRatio > ARTIFACT_RATIO_THRESHOLD) {
    return {
      level: "medium",
      label: "Среднее качество",
      advice: "Распознавание не идеальное — проверьте текст и при необходимости уточните.",
      charCount,
    };
  }

  return {
    level: "high",
    label: "Хорошо распознан",
    advice: null,
    charCount,
  };
}

export const ocrLevelColor: Record<OcrLevel, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  low: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  none: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};
