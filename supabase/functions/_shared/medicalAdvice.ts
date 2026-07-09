export interface CanonicalAdvice {
  key: string;
  text: string;
  specificity: number;
}

export function normalizeAdviceText(value: unknown): string {
  return String(value ?? "")
    .replace(/^\s*\d+[\.)]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'“”()[\].,;:!?]/g, " ")
    .replace(/\bповторн[а-я]*\b/gu, "")
    .replace(/\bврача[-\s]*/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SPECIALISTS: Array<{
  pattern: RegExp;
  key: string;
  label: string;
  specificity: number;
}> = [
  {
    pattern: /аллерголог[а-я-]*иммунолог/iu,
    key: "allergologist",
    label: "Консультация аллерголога-иммунолога",
    specificity: 2,
  },
  {
    pattern: /аллерголог/iu,
    key: "allergologist",
    label: "Консультация аллерголога",
    specificity: 1,
  },
  {
    pattern: /пульмонолог/iu,
    key: "pulmonologist",
    label: "Консультация пульмонолога",
    specificity: 1,
  },
  {
    pattern: /(?:лор(?:[-\s]?врач)?|отоларинголог)/iu,
    key: "ent",
    label: "Консультация оториноларинголога",
    specificity: 1,
  },
  {
    pattern: /невролог/iu,
    key: "neurologist",
    label: "Консультация невролога",
    specificity: 1,
  },
  {
    pattern: /кардиолог/iu,
    key: "cardiologist",
    label: "Консультация кардиолога",
    specificity: 1,
  },
  {
    pattern: /гастроэнтеролог/iu,
    key: "gastroenterologist",
    label: "Консультация гастроэнтеролога",
    specificity: 1,
  },
  {
    pattern: /ортопед|травматолог/iu,
    key: "orthopedist",
    label: "Консультация травматолога-ортопеда",
    specificity: 1,
  },
  {
    pattern: /психиатр/iu,
    key: "psychiatrist",
    label: "Консультация психиатра",
    specificity: 1,
  },
  {
    pattern: /офтальмолог|окулист/iu,
    key: "ophthalmologist",
    label: "Консультация офтальмолога",
    specificity: 1,
  },
  {
    pattern: /уролог/iu,
    key: "urologist",
    label: "Консультация уролога",
    specificity: 1,
  },
];

export function canonicalizeAdvice(value: unknown): CanonicalAdvice | null {
  const text = normalizeAdviceText(value);
  if (!text) return null;
  const isConsultation = /консультаци|при[её]м\s+(?:у\s+)?врача/iu.test(text);
  if (isConsultation) {
    for (const specialist of SPECIALISTS) {
      if (specialist.pattern.test(text)) {
        return {
          key: "consultation:" + specialist.key,
          text: specialist.label,
          specificity: specialist.specificity,
        };
      }
    }
  }
  return { key: "text:" + normalizedKey(text), text, specificity: 0 };
}

export function dedupeAdvice(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ordered: Array<CanonicalAdvice & { index: number }> = [];
  const positions = new Map<string, number>();

  for (const item of items) {
    const canonical = canonicalizeAdvice(item);
    if (!canonical) continue;
    const position = positions.get(canonical.key);
    if (position === undefined) {
      positions.set(canonical.key, ordered.length);
      ordered.push({ ...canonical, index: ordered.length });
      continue;
    }
    if (canonical.specificity > ordered[position].specificity) {
      ordered[position] = { ...canonical, index: ordered[position].index };
    }
  }

  return ordered
    .sort((a, b) => a.index - b.index)
    .map((item) => item.text);
}
