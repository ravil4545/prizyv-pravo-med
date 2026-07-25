// ════════════════════════════════════════════════════════════════════════
//  Клиентская сторона публичного разбора дела (§2 предложения по оптимизации).
//
//  Типы — зеркало supabase/functions/case-review/contract.ts. Edge-функции
//  живут в Deno и не могут импортировать из src/, поэтому контракт продублирован
//  осознанно; менять оба файла одновременно.
// ════════════════════════════════════════════════════════════════════════

import { SUPABASE_URL } from "@/lib/supabaseConfig";

export type ReviewStage = "summons" | "medical_board" | "decision_made" | "preparing";

export interface StageOption {
  value: ReviewStage;
  label: string;
  hint: string;
}

/** Первый вопрос разбора. Порядок — по частоте в реальных обращениях. */
export const STAGE_OPTIONS: StageOption[] = [
  { value: "summons", label: "Пришла повестка", hint: "Есть срок, действовать нужно быстро" },
  { value: "medical_board", label: "Готовлюсь к медкомиссии", hint: "Нужно собрать документы заранее" },
  { value: "decision_made", label: "Решение уже приняли", hint: "Не согласен, хочу обжаловать" },
  { value: "preparing", label: "Готовлюсь заранее", hint: "Повестки пока нет" },
];

export type HasDocuments = "yes" | "partial" | "no";

export const DOCUMENTS_OPTIONS: Array<{ value: HasDocuments; label: string }> = [
  { value: "yes", label: "Да, есть заключения и выписки" },
  { value: "partial", label: "Кое-что есть, но немного" },
  { value: "no", label: "Нет, только жалобы" },
];

export interface ReviewArticle {
  number: string;
  title: string;
  why: string;
}

export interface ChecklistItem {
  title: string;
  why: string;
}

export interface LegalChecklistItem extends ChecklistItem {
  templateKey: string | null;
}

export interface ReviewResult {
  articles: ReviewArticle[];
  /** Готовность дела 0–10: полнота документов, НЕ вероятность решения комиссии. */
  readiness: { score: number; confirmed: string[]; missing: string[] };
  medical: ChecklistItem[];
  legal: LegalChecklistItem[];
  summary: string;
  daysUntilConscription: number | null;
  disclaimer: string;
}

export interface ReviewRequest {
  stage: ReviewStage;
  complaint: string;
  hasDocuments: HasDocuments;
  conscriptionDate?: string;
}

/** Ключ, под которым результат переживает переход на регистрацию. */
export const REVIEW_STORAGE_KEY = "nepriziv_case_review_v1";

export class CaseReviewError extends Error {
  constructor(message: string, readonly rateLimited = false) {
    super(message);
    this.name = "CaseReviewError";
  }
}

export async function requestCaseReview(
  input: ReviewRequest,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/case-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new CaseReviewError(
      data?.error || `Ошибка сервера: ${res.status}`,
      res.status === 429,
    );
  }
  return (await res.json()) as ReviewResult;
}

/**
 * Подпись к шкале готовности. Осознанно НЕ проценты и не «шанс»: шкала
 * показывает полноту документов и то, что нужно сделать, чтобы её поднять.
 */
export function readinessLabel(score: number): string {
  if (score <= 3) return "Дело только начато";
  if (score <= 6) return "Основа есть, не хватает подтверждений";
  if (score <= 8) return "Дело близко к готовности";
  return "Документы собраны полно";
}

/** Насколько срочно — для акцента на сроках. */
export function urgencyLabel(daysLeft: number | null): { text: string; urgent: boolean } | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return { text: `Дата прошла ${Math.abs(daysLeft)} дн. назад`, urgent: true };
  if (daysLeft === 0) return { text: "Мероприятия сегодня", urgent: true };
  if (daysLeft <= 14) return { text: `Осталось ${daysLeft} дн.`, urgent: true };
  return { text: `Осталось ${daysLeft} дн.`, urgent: false };
}
