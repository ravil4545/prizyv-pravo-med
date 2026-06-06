// ════════════════════════════════════════════════════════════════════════
//  RAG-поиск по «второму мозгу» (rag_chunks) — общий модуль для всех функций.
//
//  Источник знаний — таблица rag_chunks, наполняемая из Obsidian-волта
//  SecondBrain скриптом scripts/ingest_rag.py (база знаний + реальная практика:
//  кейсы, вопросы врачу, стратегии, расписание болезней).
//
//  Три способа поиска (берём подходящий под задачу):
//    • searchByArticles — точная выборка экспертных заметок по номерам статей РБ
//      (для analyze-medical-document, когда статья уже определена). Без эмбеддинга.
//    • searchByVector   — семантический поиск (Jina + RPC match_rag_chunks).
//      Для свободных вопросов в чатах. Нужен JINA_API_KEY.
//    • searchByText     — дешёвый ilike-фолбэк (для агентов с жёстким бюджетом контекста,
//      где лишние токены/вызовы критичны). Без эмбеддинга и без Jina.
// ════════════════════════════════════════════════════════════════════════

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

/** Выверенная экспертиза: теория + методички. Безопасно для любых ответов. */
export const KNOWLEDGE_CATEGORIES = [
  "medical_condition", "legal_procedure", "document_guide", "faq",
  "schedule_rb", "rb_official", "reference", "strategy",
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

/** Эмбеддинг запроса (Jina v3, 1024 dims, retrieval.query). */
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
 * Семантический поиск по базе знаний. Возвращает [] при любой ошибке
 * (fail-open: RAG не должен ронять основной ответ ИИ).
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
 * Гибридный поиск: ключевые слова (точные совпадения) + вектор (семантика).
 * Нужен, потому что эмбеддинги Jina v3 на русских мед-текстах слабо
 * дискриминируют (cosine ~0.9 даже между разными темами) — чистый вектор
 * часто не вытаскивает нужную заметку. Keyword-совпадения по значимым словам
 * запроса ставятся выше и гарантируют попадание тематических заметок.
 */
export async function searchHybrid(
  sb: Sb,
  query: string,
  opts: { matchCount?: number; minSimilarity?: number; categories?: readonly string[]; articles?: string[] } = {},
): Promise<KnowledgeChunk[]> {
  const matchCount = opts.matchCount ?? 6;

  // Значимые слова запроса (≥5 букв, до 6 штук). Грубый стемминг: режем 2
  // последних буквы у длинных слов, чтобы ловить словоформы (плоскостопиЯ →
  // корень «плоскостопи» матчит «плоскостопиЕ» в тексте). Русская морфология.
  const rawWords = [...new Set(
    (query.toLowerCase().match(/[а-яёa-z]{5,}/gi) || []),
  )].slice(0, 6);
  const stems = rawWords.map((w) => (w.length > 6 ? w.slice(0, -2) : w));

  // Числа из запроса (155, 6.0, 17, № статьи…) — КЛЮЧЕВОЙ сигнал на медтекстах:
  // чанк с тем же числом почти всегда самый релевантный. Keyword-regex цифры
  // игнорирует ([а-яё]{5,}), поэтому учитываем их отдельно и сильно бустим ранг.
  const nums = [...new Set((query.match(/\d+(?:[.,]\d+)?/g) || []))]
    .map((n) => n.replace(",", "."))
    .filter((n) => n.length >= 2)
    .slice(0, 4);
  const numHit = (content: string): boolean =>
    nums.some((n) => content.includes(n) || content.includes(n.replace(".", ",")));

  // 1) Keyword: чанки с корнями слов запроса; ранг = покрытие корней + бонус за число.
  let kw: KnowledgeChunk[] = [];
  if (stems.length) {
    // Доменные стоп-стемы: частотны в военкоматных текстах (есть почти в каждом
    // чанке) → НЕ дискриминируют тему, но вытесняют специфичный термин из выборки
    // `limit` (которая без ORDER BY). Убираем их, чтобы OR искал по значимым словам
    // («плоскостоп»), а не по «болезн/категор/статья». Без этого score=5-чанк про
    // плоскостопие не попадал в 30 кандидатов из-за частых общих слов.
    const STOP_STEMS = ["болезн", "категор", "стать", "расписан", "годнос", "призыв",
      "военком", "какая", "какие", "какой", "нужно", "можно", "поэтому", "которы", "освобожд"];
    let effStems = stems.filter((w) => !STOP_STEMS.some((s) => w.startsWith(s) || s.startsWith(w)));
    if (!effStems.length) effStems = stems; // запрос состоит только из общих слов — откат
    const orExpr = effStems.map((w) => `content.ilike.%${w}%`).join(",");
    let qb = sb
      .from("rag_chunks")
      .select("id, content, category, section_title, schedule_articles")
      .eq("is_foundational", false)
      .or(orExpr);
    // Срез по разделам (напр. публичный виджет — только выверенные знания,
    // без сырой практики) — точнее и не тянет лишнее в промпт.
    if (opts.categories?.length) qb = qb.in("category", [...opts.categories]);
    const { data } = await qb.limit(60);
    kw = (data ?? [])
      .map((c: KnowledgeChunk) => {
        const lc = c.content.toLowerCase();
        const stemScore = effStems.filter((w) => lc.includes(w)).length;
        return { c, score: stemScore + (numHit(c.content) ? 3 : 0) };
      })
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .filter((x: { score: number }) => x.score >= Math.min(2, effStems.length))
      .map((x: { c: KnowledgeChunk }) => x.c);
  }

  // 2) Вектор (семантика) — добивает то, что keyword не поймал.
  const vec = await searchByVector(sb, query, {
    matchCount,
    minSimilarity: opts.minSimilarity ?? 0.2,
    categories: opts.categories,
    articles: opts.articles,
  });

  // 3) Слияние с дедупликацией: сначала точные keyword-хиты, затем вектор.
  const seen = new Set<string>();
  const out: KnowledgeChunk[] = [];
  for (const c of [...kw, ...vec]) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= matchCount) break;
  }
  return out;
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
