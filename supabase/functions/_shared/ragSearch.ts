// ════════════════════════════════════════════════════════════════════════
//  RAG-поиск по «второму мозгу» (rag_chunks) — общий модуль для всех функций.
//
//  Источник знаний — таблица rag_chunks, наполняемая из Obsidian-волта
//  SecondBrain скриптом scripts/ingest_rag.py (база знаний + реальная практика:
//  кейсы, вопросы врачу, стратегии, расписание болезней).
//
//  Способы поиска (берём подходящий под задачу):
//    • searchByArticles — точная выборка экспертных заметок по номерам статей РБ
//      (для analyze-medical-document, когда статья уже определена). Без эмбеддинга.
//    • searchHybrid     — гибрид FTS (русская морфология) + вектор, слияние RRF
//      на стороне БД (RPC hybrid_rag_chunks). Для свободных вопросов в чатах.
//    • searchByVector   — чистый семантический поиск (Jina + RPC match_rag_chunks).
//      Откат для searchHybrid. Нужен JINA_API_KEY.
//    • searchByText     — дешёвый ilike-фолбэк (для агентов с жёстким бюджетом контекста,
//      где лишние токены/вызовы критичны). Без эмбеддинга и без Jina.
//    • rerankChunks     — LLM-реранкер (как в Hermes): над-извлечение → отбор
//      реально релевантных кандидатов. Fail-open.
// ════════════════════════════════════════════════════════════════════════

import { llmChat, MODEL_FAST } from "./llmGateway.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

export interface KnowledgeChunk {
  id: string;
  content: string;
  category: string | null;
  section_title?: string | null;
  schedule_articles?: string[] | null;
  target_category?: string | null;
  priority?: string | null;
  source_path?: string | null;
  source_title?: string | null;
  content_hash?: string | null;
  similarity?: number;
  semantic_similarity?: number | null;
}

const JINA_KEY = Deno.env.get("JINA_API_KEY");
const JINA_QUERY_TASK = Deno.env.get("JINA_QUERY_TASK") === "retrieval.passage"
  ? "retrieval.passage"
  : "retrieval.query";

// ──────────────────────────────────────────────────────────────────────────
//  ОГЛАВЛЕНИЕ / РОУТИНГ. Категории канонические (строго по папке волта, см.
//  scripts/ingest_rag.py → FOLDER_CATEGORY). Пресеты ниже позволяют каждому
//  потребителю тянуть ТОЛЬКО нужный срез базы — это и точнее, и не раздувает
//  промпт, и держит сырую практику (с возможными ПДн) подальше от публичных
//  ответов.
// ──────────────────────────────────────────────────────────────────────────

/** Выверенная экспертиза: теория + методички + обезличенные прецеденты
 *  (SecondBrain/60_Прецеденты, category "precedent", плейсхолдеры [ПЕРСОНА_NNN],
 *  прошли аудит анонимизации). Безопасно для любых ответов, включая публичный чат. */
export const KNOWLEDGE_CATEGORIES = [
  "medical_condition",
  "legal_procedure",
  "document_guide",
  "faq",
  "schedule_rb",
  "rb_official",
  "reference",
  "strategy",
  "precedent",
] as const;

/** Сырая практика (консультации/транскрипты/Q&A/кейсы) — может содержать
 *  частные детали; в публичный виджет НЕ подмешиваем. */
export const PRACTICE_CATEGORIES = [
  "consultation",
  "doctor_qa",
  "transcript",
  "case",
] as const;

export const ALL_RAG_CATEGORIES = [
  ...KNOWLEDGE_CATEGORIES,
  ...PRACTICE_CATEGORIES,
] as const;

/** Выверенные источники для проверки медицинского документа. Практика и
 * прецеденты не задают обязательные требования к конкретному диагнозу. */
export const MEDICAL_REQUIREMENT_CATEGORIES = [
  "medical_condition",
  "document_guide",
  "schedule_rb",
  "rb_official",
] as const;

/** Дословный официальный текст РБ-565 — большой (сотни чанков); тянуть только
 *  когда явно нужна формулировка статьи, иначе доминирует в общей выдаче. */
export const RB_OFFICIAL_CATEGORY = "rb_official";

/**
 * Извлекает номера статей РБ из свободного текста: «ст. 68», «статья 66»,
 * «ст 43в», «по 68-й». Возвращает чистые номера (['68','66']) для точечного
 * фильтра по schedule_articles — главный рычаг «искать только нужное».
 */
export function extractArticleNumbers(text: string): string[] {
  const out = new Set<string>();
  const re = /ст(?:атья|атьи|\.)?\s*№?\s*(\d{1,3})/gi;
  for (const m of text.matchAll(re)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 88) out.add(String(n)); // РБ-565: статьи 1..88
  }
  return [...out];
}

export function expandArticleVariants(
  articleNumbers: Array<string | number>,
): string[] {
  const out = new Set<string>();
  for (const raw of articleNumbers) {
    const match = String(raw).toLowerCase().match(/(\d{1,3})\s*([а-д])?/u);
    if (!match) continue;
    const number = String(Number(match[1]));
    if (Number(number) < 1 || Number(number) > 88) continue;
    out.add(number);
    if (match[2]) out.add(number + match[2]);
    for (const suffix of ["а", "б", "в", "г", "д"]) {
      out.add(number + suffix);
    }
  }
  return [...out];
}

/** Есть ли возможность семантического поиска (задан ключ Jina). */
export function isVectorSearchAvailable(): boolean {
  return !!JINA_KEY;
}

/** Эмбеддинг запроса Jina v3. Документы индексируются как retrieval.passage,
 * запросы по умолчанию как retrieval.query; аварийный откат управляется env. */
export async function embedQuery(text: string): Promise<number[]> {
  if (!JINA_KEY) throw new Error("JINA_API_KEY не настроен");
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      task: JINA_QUERY_TASK,
      dimensions: 1024,
      input: [text.slice(0, 8000)],
    }),
  });
  if (!res.ok) {
    throw new Error(`Jina embeddings error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.data[0].embedding as number[];
}

/**
 * Чистый семантический поиск по базе знаний. Возвращает [] при любой ошибке
 * (fail-open: RAG не должен ронять основной ответ ИИ). Используется как откат
 * для searchHybrid, если RPC гибрида недоступен.
 */
export async function searchByVector(
  sb: Sb,
  query: string,
  opts: {
    matchCount?: number;
    minSimilarity?: number;
    categories?: readonly string[];
    articles?: string[];
  } = {},
): Promise<KnowledgeChunk[]> {
  try {
    if (!JINA_KEY) return [];
    const embedding = await embedQuery(query);
    const { data, error } = await sb.rpc("match_rag_chunks", {
      query_embedding: embedding,
      match_count: opts.matchCount ?? 5,
      min_similarity: opts.minSimilarity ?? 0.25,
      filter_categories: opts.categories?.length ? [...opts.categories] : null,
      filter_articles: opts.articles?.length ? opts.articles : null,
    });
    if (error) {
      console.error("[ragSearch] match_rag_chunks:", error.message);
      return [];
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error(
      "[ragSearch] searchByVector failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

/**
 * Точная выборка экспертных заметок по номерам статей Расписания болезней.
 * Использует массив schedule_articles (overlaps). Без эмбеддинга — дёшево и
 * детерминированно. Поддерживает варианты записи статьи: «68», «68в».
 */
export async function searchByArticles(
  sb: Sb,
  articleNumbers: Array<string | number>,
  limit = 12,
  categories: readonly string[] = MEDICAL_REQUIREMENT_CATEGORIES,
): Promise<KnowledgeChunk[]> {
  try {
    const variants = expandArticleVariants(articleNumbers);
    if (!variants.length) return [];
    let query = sb
      .from("rag_chunks")
      .select(
        "id, content, category, section_title, schedule_articles, target_category, priority, source_path, source_title, content_hash",
      )
      .overlaps("schedule_articles", variants);
    if (categories.length) {
      query = query.in("category", [...categories]);
    }
    const { data, error } = await query
      .order("priority", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error("[ragSearch] searchByArticles:", error.message);
      return [];
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error(
      "[ragSearch] searchByArticles failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

/**
 * Дешёвый текстовый поиск (ilike по content/section_title + теги/статьи).
 * Для агентов: без эмбеддинга и без лишних LLM-токенов.
 */
export async function searchByText(
  sb: Sb,
  query: string,
  limit = 4,
): Promise<KnowledgeChunk[]> {
  try {
    const term = String(query).replace(/[,()%*]/g, " ").replace(/\s+/g, " ")
      .trim().slice(0, 80);
    if (!term) return [];
    const { data, error } = await sb
      .from("rag_chunks")
      .select("id, content, category, section_title, schedule_articles")
      .or(`content.ilike.%${term}%,section_title.ilike.%${term}%`)
      .limit(limit);
    if (error) {
      console.error("[ragSearch] searchByText:", error.message);
      return [];
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error(
      "[ragSearch] searchByText failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

/**
 * Гибридный поиск: Postgres FTS (русская морфология) + вектор, слияние
 * Reciprocal Rank Fusion в одном RPC `hybrid_rag_chunks`. FTS ловит точные
 * термины (номера статей, диоптрии/градусы, диагнозы), вектор добивает
 * семантику. query_embedding опционален: без Jina работает только FTS-лег.
 *
 * Fail-open: ошибка RPC → откат на чистый вектор (searchByVector), затем на
 * пусто. RAG не должен ронять основной ответ ИИ.
 */
export async function searchHybrid(
  sb: Sb,
  query: string,
  opts: {
    matchCount?: number;
    minSimilarity?: number;
    categories?: readonly string[];
    articles?: string[];
  } = {},
): Promise<KnowledgeChunk[]> {
  const matchCount = opts.matchCount ?? 6;
  try {
    // Эмбеддинг запроса, если задан Jina. Без него гибрид деградирует до FTS —
    // не падаем (query_embedding=null корректно обрабатывается в RPC).
    let embedding: number[] | null = null;
    if (JINA_KEY) {
      try {
        embedding = await embedQuery(query);
      } catch (e) {
        console.error(
          "[ragSearch] embedQuery failed (FTS-only):",
          e instanceof Error ? e.message : e,
        );
      }
    }
    const { data, error } = await sb.rpc("hybrid_rag_chunks", {
      query_text: query,
      query_embedding: embedding,
      match_count: matchCount,
      filter_categories: opts.categories?.length ? [...opts.categories] : null,
      filter_articles: opts.articles?.length ? opts.articles : null,
      min_similarity: opts.minSimilarity ?? 0.20,
    });
    if (error) {
      console.error("[ragSearch] hybrid_rag_chunks:", error.message);
      return await searchByVector(sb, query, opts); // откат на чистый вектор
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error(
      "[ragSearch] searchHybrid failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

export function dedupeChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const out: KnowledgeChunk[] = [];
  for (const chunk of chunks) {
    const contentKey = chunk.content_hash ||
      chunk.content.toLowerCase().replace(/\s+/g, " ").trim();
    if (!chunk.id || seenIds.has(chunk.id) || seenContent.has(contentKey)) {
      continue;
    }
    seenIds.add(chunk.id);
    seenContent.add(contentKey);
    out.push(chunk);
  }
  return out;
}

export function diversifyChunks(
  chunks: KnowledgeChunk[],
  maxPerSource = 3,
): KnowledgeChunk[] {
  const perSource = new Map<string, number>();
  return dedupeChunks(chunks).filter((chunk) => {
    const source = chunk.source_path || chunk.id.split("#s")[0];
    const count = perSource.get(source) ?? 0;
    if (count >= maxPerSource) return false;
    perSource.set(source, count + 1);
    return true;
  });
}

export function traceRagChunks(label: string, chunks: KnowledgeChunk[]): void {
  console.log(
    "[ragSearch] " + label,
    chunks.map((chunk) => ({
      id: chunk.id,
      score: chunk.similarity ?? null,
      semantic: chunk.semantic_similarity ?? null,
    })),
  );
}

/**
 * LLM-реранкер (как в Hermes rag_pipeline). Из кандидатов оставляет только
 * реально релевантные запросу чанки, переупорядочивая по убыванию релевантности.
 * Паттерн: над-извлечение (matchCount 10-12) → реранк до keep (~5-6). Убирает
 * поверхностно похожие чанки, чтобы LLM не отвлекался на нерелевантное.
 *
 * Дешёвая модель (MODEL_FAST), JSON-режим, temperature=0. Fail-open: при любой
 * ошибке/таймауте возвращает исходный топ (keep), не теряя выдачу.
 */
export async function rerankChunks(
  query: string,
  chunks: KnowledgeChunk[],
  opts: { keep?: number; signal?: AbortSignal } = {},
): Promise<KnowledgeChunk[]> {
  const keep = opts.keep ?? 5;
  const candidates = dedupeChunks(chunks);
  if (candidates.length <= 1) return candidates.slice(0, keep);
  try {
    const listing = candidates
      .map((c, i) => {
        const source = c.source_title || c.source_path || c.category ||
          "знание";
        const title = c.section_title
          ? source + ": " + c.section_title
          : source;
        return "[" + i + "] (" + title + ")\n" + c.content.slice(0, 700);
      })
      .join("\n\n");
    const system =
      "Ты — реранкер фрагментов базы знаний для медико-юридического ассистента по призыву (РФ). " +
      "Дан вопрос пользователя и пронумерованные фрагменты. Верни индексы ТОЛЬКО тех фрагментов, " +
      "которые реально отвечают на вопрос (тот же диагноз / статья РБ / процедура / ситуация). " +
      "Поверхностно похожие или про другую тему — НЕ включай. Сохрани порядок по убыванию " +
      'релевантности. Ответь строго JSON: {"relevant": [<номера фрагментов>]}';
    const res = await llmChat({
      model: MODEL_FAST,
      temperature: 0,
      responseFormat: "json_object",
      maxTokens: 200,
      maxRetries: 1,
      signal: opts.signal,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: "Вопрос: " + query + "\n\nФрагменты:\n" + listing,
        },
      ],
    });
    if (!res.ok) {
      console.error("[ragSearch] rerankChunks LLM error:", res.status);
      return diversifyChunks(candidates, 2).slice(0, keep);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const ids: unknown = parsed?.relevant;
    if (!Array.isArray(ids)) {
      return diversifyChunks(candidates, 2).slice(0, keep);
    }
    const picked = ids
      .filter((i): i is number =>
        Number.isInteger(i) && i >= 0 && i < candidates.length
      )
      .map((i) => candidates[i]);
    // Валидный пустой список означает, что релевантных фрагментов нет.
    return diversifyChunks(picked, 2).slice(0, keep);
  } catch (e) {
    console.error(
      "[ragSearch] rerankChunks failed:",
      e instanceof Error ? e.message : e,
    );
    return diversifyChunks(candidates, 2).slice(0, keep);
  }
}

export async function searchMedicalRequirements(
  sb: Sb,
  query: string,
  articleNumbers: Array<string | number>,
  opts: { keep?: number; signal?: AbortSignal } = {},
): Promise<KnowledgeChunk[]> {
  const variants = expandArticleVariants(articleNumbers);
  const semantic = await searchHybrid(sb, query.slice(0, 6000), {
    matchCount: 18,
    minSimilarity: 0.18,
    categories: MEDICAL_REQUIREMENT_CATEGORIES,
    articles: variants.length ? variants : undefined,
  });
  // Открытый лег нужен для исправления ошибки первого прохода: если vision
  // предварительно выбрал не ту статью, жёсткий фильтр иначе не даст найти
  // правильную профильную заметку.
  const openSemantic = variants.length
    ? await searchHybrid(sb, query.slice(0, 6000), {
      matchCount: 12,
      minSimilarity: 0.20,
      categories: MEDICAL_REQUIREMENT_CATEGORIES,
    })
    : [];
  const exact = variants.length
    ? await searchByArticles(
      sb,
      articleNumbers,
      18,
      MEDICAL_REQUIREMENT_CATEGORIES,
    )
    : [];
  const candidates = dedupeChunks([...semantic, ...openSemantic, ...exact]);
  const chunks = await rerankChunks(query.slice(0, 4000), candidates, {
    keep: opts.keep ?? 8,
    signal: opts.signal,
  });
  traceRagChunks("medical-requirements", chunks);
  return chunks;
}

/** Рендер чанков в компактный текст для подмешивания в промпт. */
export function renderChunks(
  chunks: KnowledgeChunk[],
  perChunkCap = 700,
): string {
  return chunks
    .map((c) => {
      const source = c.source_title || c.category || "знание";
      const tag = c.section_title
        ? `[${source}: ${c.section_title}]`
        : `[${source}]`;
      const body = c.content.length > perChunkCap
        ? c.content.slice(0, perChunkCap) + "…"
        : c.content;
      return `${tag}\n${body}`;
    })
    .join("\n\n---\n\n");
}
