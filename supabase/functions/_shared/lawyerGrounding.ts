// Общий grounded-контекст для AI-помощников юриста (суфлёр и ревью черновика).
// Один и тот же ContextBundle + SecondBrain исключают расхождение между функциями.

import {
  assembleLawyerClientContext,
  serializeBundle,
  type ContextBundle,
} from "./contextBundle.ts";
import {
  ALL_RAG_CATEGORIES,
  renderChunks,
  rerankChunks,
  searchHybrid,
  traceRagChunks,
  type KnowledgeChunk,
} from "./ragSearch.ts";
import { getRagAnswerPolicy } from "./ragPolicy.ts";

type Sb = unknown;

export type GroundingConfidence = "low" | "medium" | "high";

export interface GroundingSource {
  title: string;
  section: string | null;
  articles: string[];
}

export interface LawyerGrounding {
  bundle: ContextBundle;
  contextText: string;
  knowledgeText: string;
  answerPolicy: string;
  sources: GroundingSource[];
  confidence: GroundingConfidence;
  groundingNotice: string | null;
}

function sourceFromChunk(chunk: KnowledgeChunk): GroundingSource {
  return {
    title: chunk.source_title || chunk.source_path || chunk.category || "SecondBrain",
    section: chunk.section_title || null,
    articles: (chunk.schedule_articles || []).map(String).slice(0, 5),
  };
}

function uniqueSources(chunks: KnowledgeChunk[]): GroundingSource[] {
  const seen = new Set<string>();
  const out: GroundingSource[] = [];
  for (const chunk of chunks) {
    const source = sourceFromChunk(chunk);
    const key = `${source.title}::${source.section || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Собирает полный контекст дела и релевантный срез SecondBrain.
 * Fail-open RAG: если поиск недоступен, помощник всё равно получает ContextBundle,
 * но ответ маркируется низкой уверенностью и обязан избегать точных утверждений.
 */
export async function buildLawyerGrounding(
  sb: Sb,
  lawyerClientId: string,
  lawyerId: string,
  focus: string,
): Promise<LawyerGrounding> {
  const bundle = await assembleLawyerClientContext(sb, lawyerClientId, lawyerId, {
    maxChatMessages: 18,
    maxDocs: 20,
  });

  const contextText = serializeBundle(bundle, {
    include: ["client", "crm", "plans", "documents", "chat", "events"],
    maxChars: 8500,
    docTextChars: 700,
    maxChatMessages: 10,
  });

  const documentSignals = bundle.documents.slice(0, 6).flatMap((doc) => [
    doc.title,
    doc.category,
    doc.explanation,
    ...doc.articles.map((article) => `статья ${article.articleNumber} ${article.title}`),
  ]).filter(Boolean).join("; ");

  const searchQuery = [
    focus,
    bundle.crm?.diagnosis,
    bundle.crm?.expectedCategory,
    documentSignals,
  ].filter(Boolean).join("\n").slice(0, 5000);

  const [candidates, answerPolicy] = await Promise.all([
    searchHybrid(sb, searchQuery, {
      matchCount: 14,
      minSimilarity: 0.18,
      categories: ALL_RAG_CATEGORIES,
    }),
    getRagAnswerPolicy(sb),
  ]);
  const chunks = await rerankChunks(searchQuery.slice(0, 3500), candidates, { keep: 6 });
  traceRagChunks("lawyer-grounding", chunks);

  const sources = uniqueSources(chunks);
  const confidence: GroundingConfidence = chunks.length >= 4
    ? "high"
    : chunks.length >= 2
    ? "medium"
    : "low";

  const notices = [
    confidence === "low"
      ? "В SecondBrain найдено недостаточно опорных материалов. Проверьте правовые выводы и реквизиты источников вручную."
      : null,
    bundle.meta.accessNote,
  ].filter((notice): notice is string => Boolean(notice));
  const groundingNotice = notices.length > 0 ? notices.join(" ") : null;

  return {
    bundle,
    contextText,
    knowledgeText: renderChunks(chunks, 750),
    answerPolicy,
    sources,
    confidence,
    groundingNotice,
  };
}
