// ════════════════════════════════════════════════════════════════════════
//  Фильтрация, сортировка и производные показатели списка медицинских
//  документов. Вынесено из MedicalDocumentsPage.tsx — чистые функции без
//  React, поэтому покрываются тестами.
// ════════════════════════════════════════════════════════════════════════

import type {
  MedicalDocument,
  SortDirection,
  SortField,
} from "./medicalDocumentTypes";
import { categoryInfo } from "./fitnessCategories";

export interface DocumentFilter {
  /** id типа документа либо "all". */
  filterType: string;
  /** Поиск по названию. */
  searchQuery: string;
}

export interface DocumentSort {
  sortField: SortField;
  sortDirection: SortDirection;
}

/**
 * Даты (`uploaded_at`, `document_date`) приходят из Postgres в ISO —
 * а ISO-строки сравниваются лексикографически ровно так же, как
 * хронологически. Отдельный Date.parse тут не нужен и только добавил бы
 * NaN на пустых значениях.
 */
function compareValues(field: SortField, a: string, b: string): number {
  if (field === "title") return a.localeCompare(b, "ru");
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Фильтр + сортировка. Опросник всегда закреплён сверху: это единственный
 * документ, который человек заполняет сам, и именно с него начинается разбор.
 */
export function filterAndSortDocuments(
  documents: MedicalDocument[],
  { filterType, searchQuery }: DocumentFilter,
  { sortField, sortDirection }: DocumentSort,
): MedicalDocument[] {
  const query = searchQuery.trim().toLowerCase();

  return documents
    .filter((doc) => {
      if (filterType !== "all" && doc.document_type_id !== filterType) return false;
      // Документ без названия при активном поиске раньше молча выпадал из
      // выдачи, хотя пользователь мог искать не по названию, а «вообще».
      if (query && !(doc.title ?? "").toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => {
      const aPinned = a.meta?.is_questionnaire === true;
      const bPinned = b.meta?.is_questionnaire === true;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aVal = a[sortField];
      const bVal = b[sortField];

      // Пустые значения всегда внизу — независимо от направления сортировки.
      // Иначе «сначала старые» показывало бы сверху документы без даты.
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const comparison = compareValues(sortField, aVal, bVal);
      return sortDirection === "asc" ? comparison : -comparison;
    });
}

/** Следующее состояние сортировки при клике по заголовку колонки. */
export function nextSortState(current: DocumentSort, field: SortField): DocumentSort {
  if (current.sortField !== field) return { sortField: field, sortDirection: "desc" };
  return {
    sortField: field,
    sortDirection: current.sortDirection === "asc" ? "desc" : "asc",
  };
}

/**
 * Вариант бейджа категории годности.
 *
 * Раньше здесь был локальный switch, в котором В и Д красились в
 * `destructive` — красный. Для этой аудитории это ровно наоборот: В
 * («ограниченно годен») и Д («не годен») — цель обращения на сайт, военный
 * билет. Красный цвет на самом желанном исходе читается как «плохие
 * новости». Значения берём из общего справочника fitnessCategories, чтобы
 * каталог диагнозов и кабинет не расходились.
 */
export function categoryBadgeVariant(
  category: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  const info = categoryInfo(category?.trim().toUpperCase() ?? null);
  if (!info) return "secondary";
  if (info.exempt) return "default"; // В, Д — освобождение
  if (info.code === "Г") return "outline"; // отсрочка — промежуточный исход
  return "secondary"; // А, Б — призыв не отменён
}

export interface DocumentsOverview {
  analyzedDocuments: MedicalDocument[];
  /** Документ с наибольшей силой подтверждения — на нём строится вывод. */
  bestDocument: MedicalDocument | undefined;
  hasQuestionnaire: boolean;
  uniqueRecommendations: string[];
  /** Что человеку сделать дальше — по пунктам, максимум пять. */
  nextActions: string[];
}

const WEAK_EVIDENCE_THRESHOLD = 50;

export function buildDocumentsOverview(
  documents: MedicalDocument[],
  maxRecommendations = 4,
): DocumentsOverview {
  const analyzedDocuments = documents.filter(
    (doc) => doc.ai_fitness_category || doc.ai_category_chance !== null || doc.ai_explanation,
  );

  const bestDocument = analyzedDocuments
    .filter((doc) => doc.ai_category_chance !== null)
    .reduce<MedicalDocument | undefined>(
      (best, doc) =>
        !best || (doc.ai_category_chance ?? 0) > (best.ai_category_chance ?? 0) ? doc : best,
      undefined,
    );

  const hasQuestionnaire = documents.some((doc) => doc.meta?.is_questionnaire === true);

  const uniqueRecommendations = [
    ...new Set(
      documents
        .flatMap((doc) => doc.ai_recommendations ?? [])
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  ].slice(0, maxRecommendations);

  const nextActions = [
    documents.length === 0
      ? "Загрузите хотя бы одну свежую выписку, заключение или снимок."
      : null,
    analyzedDocuments.length === 0
      ? "Запустите AI-анализ, чтобы увидеть категорию и привязку к статьям."
      : null,
    !hasQuestionnaire
      ? "Заполните опросник: жалобы и симптомы часто не видны в справках."
      : null,
    bestDocument && (bestDocument.ai_category_chance ?? 0) < WEAK_EVIDENCE_THRESHOLD
      ? "Добавьте более свежие обследования или документы с функциональными нарушениями."
      : null,
    uniqueRecommendations.length === 0 && analyzedDocuments.length > 0
      ? "Задайте ИИ вопрос: какие документы усилят позицию по этому диагнозу."
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    analyzedDocuments,
    bestDocument,
    hasQuestionnaire,
    uniqueRecommendations,
    nextActions,
  };
}
