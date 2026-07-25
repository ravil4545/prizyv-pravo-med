// ════════════════════════════════════════════════════════════════════════
//  Типы медицинских документов кабинета.
//
//  Вынесены из MedicalDocumentsPage.tsx (2834 строки): пока они жили внутри
//  страницы, любой другой модуль — сортировка, экспорт, обработка снимков —
//  был обязан импортировать саму страницу. То есть логику было нечем
//  покрыть тестами: импорт страницы тянет за собой pdfjs, jsPDF и половину
//  shadcn/ui.
// ════════════════════════════════════════════════════════════════════════

export interface DocumentType {
  id: string;
  code: string;
  name: string;
}

export interface DocumentPart {
  name: string;
  type_id?: string;
  type_name?: string;
}

export interface DocumentMeta {
  parts?: DocumentPart[];
  is_questionnaire?: boolean;
}

export interface MedicalDocument {
  id: string;
  title: string | null;
  file_url: string;
  document_date: string | null;
  uploaded_at: string;
  is_classified: boolean;
  document_type_id: string | null;
  raw_text: string | null;
  ai_fitness_category: string | null;
  ai_category_chance: number | null;
  ai_recommendations: string[] | null;
  ai_explanation: string | null;
  linked_article_id: string | null;
  meta: DocumentMeta | null;
  document_types?: DocumentType | null;
  disease_articles_565?: { article_number: string; title: string } | null;
}

export type SortField = "uploaded_at" | "document_date" | "title";
export type SortDirection = "asc" | "desc";
