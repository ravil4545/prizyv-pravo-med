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
  similarity?: number;
}

const JINA_KEY = Deno.env.get("JINA_API_KEY");

// ──────────────────────────────────────────────────────────────────────────
//  ОГЛАВЛЕНИЕ / РОУТИНГ. Категории канонические (строго по папке волта, см.
//  scripts/ingest_rag.py → FOLDER_CATEGORY). Пресеты ниже позволяют каждому
//  потребителю тянуть ТОЛЬКО нужный срез базы — это и точнее, и не раздувает
//  промпт, и держит сырую практику (с возможными ПДн) подальше от публичных
//  ответов.
// ──────────────────────────────────────────────────────────────────────────

/** Выверенная экспертиза: теория + методички + обезличенные прецеденты
 *  Hermes-KB (category "precedent", плейсхолдеры [ПЕРСОНА_NNN], прошли аудит
 *  анонимизации). Безопасно для любых ответов, включая публичный чат. */
export const KNOWLEDGE_CATEGORIES = [
  "medical_condition", "legal_procedure", "document_guide", "faq",
  "schedule_rb", "rb_official", "reference", "strategy", "precedent",
] as const;

/** Сырая практика (консультации/транскрипты/Q&A/кейсы) — может содержать
 *  частные детали; в публичный виджет НЕ подмешиваем. */
export const PRACTICE_CATEGORIES = [
  "consultation", "doctor_qa", "transcript", "case",
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

/** Есть ли возможность семантического поиска (задан ключ Jina). */
export function isVectorSearchAvailable(): boolean {
  return !!JINA_KEY;
}

/** Эмбеддинг запроса (Jina v3, 1024 dims, retrieval.passage — симметрично инжесту). */
export async function embedQuery(text: string): Promise<number[]> {
  if (!JINA_KEY) throw new Error("JINA_API_KEY не настроен");
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${JINA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      // ВАЖНО: инжест (ingest_rag.py) эмбеддит чанки как retrieval.passage.
      // Поиск ДОЛЖЕН использовать ТОТ ЖЕ task — асимметрия query/passage на этой
      // базе давала similarity ~0.2 (ниже порога) и мусор в выдаче. С passage — ~0.4+.
      task: "retrieval.passage",
      dimensions: 1024,
      input: [text.slice(0, 8000)],
    }),
  });
  if (!res.ok) throw new Error(`Jina embeddings error ${res.status}: ${await res.text()}`);
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
  opts: { matchCount?: number; minSimilarity?: number; categories?: readonly string[]; articles?: string[] } = {},
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
    console.error("[ragSearch] searchByVector failed:", e instanceof Error ? e.message : e);
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
  limit = 6,
): Promise<KnowledgeChunk[]> {
  try {
    const nums = [...new Set(articleNumbers.map((n) => String(n).trim()).filter(Boolean))];
    if (!nums.length) return [];
    // Сопоставляем и «68», и «68в»/«68 в»: тянем по точным и по префиксным вариантам.
    const variants = new Set<string>();
    for (const n of nums) {
      variants.add(n);
      for (const s of ["а", "б", "в", "г", "д"]) variants.add(`${n}${s}`);
    }
    const { data, error } = await sb
      .from("rag_chunks")
      .select("id, content, category, section_title, schedule_articles, target_category")
      .overlaps("schedule_articles", [...variants])
      .limit(limit);
    if (error) {
      console.error("[ragSearch] searchByArticles:", error.message);
      return [];
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error("[ragSearch] searchByArticles failed:", e instanceof Error ? e.message : e);
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
    const term = String(query).replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
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
    console.error("[ragSearch] searchByText failed:", e instanceof Error ? e.message : e);
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
  opts: { matchCount?: number; minSimilarity?: number; categories?: readonly string[]; articles?: string[] } = {},
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
        console.error("[ragSearch] embedQuery failed (FTS-only):", e instanceof Error ? e.message : e);
      }
    }
    const { data, error } = await sb.rpc("hybrid_rag_chunks", {
      query_text: query,
      query_embedding: embedding,
      match_count: matchCount,
      filter_categories: opts.categories?.length ? [...opts.categories] : null,
      filter_articles: opts.articles?.length ? opts.articles : null,
    });
    if (error) {
      console.error("[ragSearch] hybrid_rag_chunks:", error.message);
      return await searchByVector(sb, query, opts); // откат на чистый вектор
    }
    return (data ?? []) as KnowledgeChunk[];
  } catch (e) {
    console.error("[ragSearch] searchHybrid failed:", e instanceof Error ? e.message : e);
    return [];
  }
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
  if (chunks.length <= 1) return chunks.slice(0, keep);
  try {
    const listing = chunks
      .map((c, i) => {
        const title = c.section_title
          ? `${c.category ?? "знание"}: ${c.section_title}`
          : (c.category ?? "знание");
        return `[${i}] (${title})\n${c.content.slice(0, 500)}`;
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
        { role: "user", content: `Вопрос: ${query}\n\nФрагменты:\n${listing}` },
      ],
    });
    if (!res.ok) {
      console.error("[ragSearch] rerankChunks LLM error:", res.status);
      return chunks.slice(0, keep);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const ids: unknown = parsed?.relevant;
    const picked = (Array.isArray(ids) ? ids : [])
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < chunks.length)
      .map((i) => chunks[i]);
    // Дедуп; если реранкер вернул пусто/мусор — откат на исходный топ.
    const seen = new Set<string>();
    const out: KnowledgeChunk[] = [];
    for (const c of picked) {
      if (c?.id && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
      if (out.length >= keep) break;
    }
    return out.length ? out : chunks.slice(0, keep);
  } catch (e) {
    console.error("[ragSearch] rerankChunks failed:", e instanceof Error ? e.message : e);
    return chunks.slice(0, keep);
  }
}

/** Рендер чанков в компактный текст для подмешивания в промпт. */
export function renderChunks(chunks: KnowledgeChunk[], perChunkCap = 700): string {
  return chunks
    .map((c) => {
      const tag = c.section_title ? `[${c.category ?? "знание"}: ${c.section_title}]` : `[${c.category ?? "знание"}]`;
      const body = c.content.length > perChunkCap ? c.content.slice(0, perChunkCap) + "…" : c.content;
      return `${tag}\n${body}`;
    })
    .join("\n\n---\n\n");
}
