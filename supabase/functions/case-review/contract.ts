// ════════════════════════════════════════════════════════════════════════
//  Контракт публичного разбора дела (case-review).
//
//  Формы этих же типов на фронтенде — src/lib/caseReview.ts. Файлы держатся
//  синхронно вручную: edge-функции живут в Deno и не могут импортировать из
//  src/ (разные рантаймы и системы модулей).
// ════════════════════════════════════════════════════════════════════════

export type ReviewStage = "summons" | "medical_board" | "decision_made" | "preparing";

export const STAGE_LABELS: Record<ReviewStage, string> = {
  summons: "Пришла повестка",
  medical_board: "Готовлюсь к медкомиссии",
  decision_made: "Решение комиссии уже принято",
  preparing: "Готовлюсь заранее, повестки пока нет",
};

export interface ReviewArticle {
  /** Номер статьи Расписания болезней, например «68». */
  number: string;
  title: string;
  /** Почему статья подходит под описание. */
  why: string;
}

export interface ChecklistItem {
  title: string;
  /** Основание: почему без этого пункта дело слабое. Без него это просто список. */
  why: string;
}

export interface LegalChecklistItem extends ChecklistItem {
  /** Ключ шаблона из docTemplates.ts либо null. */
  templateKey: string | null;
}

export interface ReviewResult {
  articles: ReviewArticle[];
  /** Готовность дела 0–10 — полнота документов, НЕ вероятность решения комиссии. */
  readiness: {
    score: number;
    confirmed: string[];
    missing: string[];
  };
  medical: ChecklistItem[];
  legal: LegalChecklistItem[];
  summary: string;
  /** Дней до призывных мероприятий: null — дата не указана, отрицательное — прошла. */
  daysUntilConscription: number | null;
  disclaimer: string;
}

/**
 * Каталог шаблонов для промпта: модель выбирает templateKey только отсюда.
 * Зеркало DOC_TEMPLATES из src/lib/docTemplates.ts (21 шаблон).
 * Добавили шаблон на фронте — добавьте строку сюда, иначе ИИ не сможет на него
 * сослаться.
 */
export const LEGAL_TEMPLATES: Array<{ key: string; title: string; category: string }> = [
  { key: "attach_docs", category: "Военкомат", title: "Заявление о приобщении медицинских документов" },
  { key: "additional_exam", category: "Военкомат", title: "Заявление о направлении на дополнительное обследование" },
  { key: "medical_exam", category: "Военкомат", title: "Заявление о проведении медицинского освидетельствования" },
  { key: "deferment_study", category: "Отсрочки", title: "Заявление об отсрочке по учёбе" },
  { key: "deferment_family", category: "Отсрочки", title: "Заявление об отсрочке по семейным обстоятельствам" },
  { key: "decision_copy", category: "Военкомат", title: "Заявление о выдаче копии решения призывной комиссии" },
  { key: "acquaint_case", category: "Военкомат", title: "Заявление об ознакомлении с личным делом" },
  { key: "appeal_commission", category: "Обжалование", title: "Жалоба на решение призывной комиссии" },
  { key: "appeal_notice", category: "Обжалование", title: "Уведомление военкомата о поданной жалобе" },
  { key: "ags", category: "АГС", title: "Заявление о замене службы на АГС" },
  { key: "military_registration", category: "Воинский учёт", title: "Заявление о постановке на воинский учёт" },
  { key: "cover_letter", category: "Военкомат", title: "Сопроводительное заявление о передаче документов" },
  { key: "form027_polyclinic", category: "Медицина", title: "Запрос выписки 027/у из поликлиники" },
  { key: "kvd_extract", category: "Медицина", title: "Запрос выписки из КВД" },
  { key: "pnd_extract", category: "Медицина", title: "Запрос выписки из ПНД" },
  { key: "med_card_kvd_pnd", category: "Медицина", title: "Запрос копии медкарты из КВД / ПНД" },
  { key: "med_card_polyclinic", category: "Медицина", title: "Запрос копии медкарты из поликлиники" },
  { key: "doctor_diagnosis_quality", category: "Жалобы (медицина)", title: "Заявление главврачу о неполном оформлении диагноза" },
  { key: "health_dept_complaint", category: "Жалобы (медицина)", title: "Жалоба в депздрав о неоформлении диагноза" },
  { key: "poa", category: "Юридические", title: "Доверенность на представителя" },
  { key: "admin_claim", category: "Суд", title: "Административный иск об оспаривании решения комиссии" },
];
