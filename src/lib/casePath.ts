// ════════════════════════════════════════════════════════════════════════
//  Карта пути дела: от диагноза до военного билета (§3 предложения).
//
//  Шесть станций, каждая — производная от УЖЕ существующих данных:
//    ① Диагноз определён     — есть связь документов со статьями РБ
//    ② Документы собраны     — покрытие требований статьи
//    ③ Документы поданы      — case_events типа «document»
//    ④ Медкомиссия пройдена  — case_events типа «medical»
//    ⑤ Решение получено      — case_events типа «commission» с исходом
//    ⑥ Военный билет         — «commission» с положительным исходом
//
//  Модуль НАМЕРЕННО чистый: никаких импортов React, Supabase и браузерных API.
//  Во-первых, это делает логику пути тестируемой (см. casePath_test.ts —
//  запускается `deno test src/lib/casePath_test.ts`, в проекте нет JS-раннера).
//  Во-вторых, ту же функцию сможет переиспользовать кабинет юриста.
// ════════════════════════════════════════════════════════════════════════

export type StationKey =
  | "diagnosis"
  | "documents"
  | "submitted"
  | "board"
  | "decision"
  | "military_id";

export type StationStatus = "done" | "current" | "todo";

export interface PathStation {
  key: StationKey;
  label: string;
  status: StationStatus;
  /** Короткая фактическая подпись: «ст. 52», «3 из 7», «12.10.2026». */
  detail: string;
  /** Что сделать, чтобы станция стала пройденной. Только у текущей. */
  hint?: string;
}

export interface CasePathEvent {
  event_type: string;
  event_date: string;
  outcome?: string | null;
}

export interface CasePathInput {
  /** Номера статей РБ, связанные с документами пользователя. */
  articles: string[];
  /** Сколько медицинских документов загружено. */
  documentsTotal: number;
  /** Сколько требований статьи закрыто и сколько всего (0/0 — требования неизвестны). */
  requirementsMet: number;
  requirementsTotal: number;
  events: CasePathEvent[];
  /** Дата призывных мероприятий, ISO. */
  conscriptionDate?: string | null;
  /** Инъекция «сегодня» для детерминированных тестов. */
  today?: Date;
}

export interface CasePath {
  stations: PathStation[];
  /** Индекс текущей станции; -1 если путь пройден целиком. */
  currentIndex: number;
  /** Готовность дела 0–10: ПОЛНОТА документов, не вероятность решения. */
  readiness: number;
  /** Дней до призывных мероприятий; null — дата неизвестна. */
  daysLeft: number | null;
}

const LABELS: Record<StationKey, string> = {
  diagnosis: "Диагноз",
  documents: "Документы",
  submitted: "Подача",
  board: "Медкомиссия",
  decision: "Решение",
  military_id: "Военный билет",
};

const ORDER: StationKey[] = ["diagnosis", "documents", "submitted", "board", "decision", "military_id"];

function hasEvent(events: CasePathEvent[], type: string): CasePathEvent | undefined {
  return events.find((e) => e.event_type === type);
}

function formatDateRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function daysUntil(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Готовность дела 0–10.
 *
 * Осознанно НЕ вероятность решения комиссии: процент вероятности не даёт
 * действия и создаёт ложные ожидания. Шкала показывает полноту материалов,
 * то есть то, на что человек может повлиять.
 *
 * Веса: определённый диагноз — 3, покрытие требований — до 5, факт подачи — 2.
 */
export function computeReadiness(input: CasePathInput): number {
  let score = 0;
  if (input.articles.length > 0) score += 3;
  else if (input.documentsTotal > 0) score += 1; // документы есть, но статья не определена

  if (input.requirementsTotal > 0) {
    score += Math.round((input.requirementsMet / input.requirementsTotal) * 5);
  } else if (input.documentsTotal > 0) {
    // Требования неизвестны — не завышаем: считаем по факту наличия документов.
    score += Math.min(2, input.documentsTotal);
  }

  if (hasEvent(input.events, "document")) score += 2;

  return Math.max(0, Math.min(10, score));
}

export function buildCasePath(input: CasePathInput): CasePath {
  const today = input.today ?? new Date();
  const daysLeft = daysUntil(input.conscriptionDate, today);

  const submitted = hasEvent(input.events, "document");
  const board = hasEvent(input.events, "medical");
  const decision = hasEvent(input.events, "commission");
  const decisionPositive = decision?.outcome === "positive";

  const diagnosisDone = input.articles.length > 0;
  const documentsDone = input.requirementsTotal > 0
    ? input.requirementsMet >= input.requirementsTotal
    : false;

  const done: Record<StationKey, boolean> = {
    diagnosis: diagnosisDone,
    documents: documentsDone,
    submitted: Boolean(submitted),
    board: Boolean(board),
    decision: Boolean(decision),
    military_id: decisionPositive,
  };

  // Текущая станция — первая непройденная. Пропуски допустимы: человек мог
  // подать документы, не закрыв все требования, — тогда «Документы» останутся
  // непройденными, но текущей станет первая незакрытая по порядку.
  const currentIndex = ORDER.findIndex((k) => !done[k]);

  const detailFor = (key: StationKey): string => {
    switch (key) {
      case "diagnosis":
        return diagnosisDone
          ? input.articles.slice(0, 3).map((a) => `ст. ${a}`).join(", ")
          : input.documentsTotal > 0
          ? "статья не определена"
          : "не начато";
      case "documents":
        if (input.requirementsTotal > 0) return `${input.requirementsMet} из ${input.requirementsTotal}`;
        return input.documentsTotal > 0 ? `загружено: ${input.documentsTotal}` : "не начато";
      case "submitted":
        return submitted ? formatDateRu(submitted.event_date) : "не начато";
      case "board":
        return board ? formatDateRu(board.event_date) : daysLeft !== null && daysLeft >= 0 ? `через ${daysLeft} дн.` : "не начато";
      case "decision":
        if (!decision) return "не начато";
        return decision.outcome === "positive"
          ? "положительное"
          : decision.outcome === "negative"
          ? "отрицательное"
          : formatDateRu(decision.event_date);
      case "military_id":
        return decisionPositive ? "получен" : "не начато";
    }
  };

  const hintFor = (key: StationKey): string => {
    switch (key) {
      case "diagnosis":
        return input.documentsTotal > 0
          ? "Загруженные документы есть, но статья РБ не определена — уточните диагноз в разборе."
          : "Опишите жалобу в разборе дела — ИИ подберёт подходящие статьи Расписания болезней.";
      case "documents": {
        const left = Math.max(0, input.requirementsTotal - input.requirementsMet);
        return left > 0
          ? `Не хватает ${left} подтверждающих документов — они перечислены в медицинском чек-листе.`
          : "Загрузите медицинские документы, подтверждающие диагноз.";
      }
      case "submitted":
        return "Подайте документы в военкомат под отметку о приёме — без неё они юридически не существуют.";
      case "board":
        return "Отметьте дату медицинского освидетельствования, чтобы не пропустить срок.";
      case "decision":
        return "После заседания зафиксируйте решение комиссии — от него считаются сроки обжалования.";
      case "military_id":
        return "Если решение отрицательное — есть 3 месяца на обжалование в суде по КАС РФ.";
    }
  };

  const stations: PathStation[] = ORDER.map((key, i) => ({
    key,
    label: LABELS[key],
    status: done[key] ? "done" : i === currentIndex ? "current" : "todo",
    detail: detailFor(key),
    ...(i === currentIndex ? { hint: hintFor(key) } : {}),
  }));

  return {
    stations,
    currentIndex,
    readiness: computeReadiness(input),
    daysLeft,
  };
}
