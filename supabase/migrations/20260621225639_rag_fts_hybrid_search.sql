-- Гибридный поиск RAG: Postgres FTS (русская морфология) + вектор, слияние RRF.
-- Заменяет ручной keyword-ilike-лег в ragSearch.ts на нативный полнотекстовый
-- поиск + RRF-слияние с pgvector в одном RPC.
-- (Сборка функции дорабатывается следующей миграцией rag_fts_hybrid_or_query.)

-- GIN-сборка требует >32MB рабочей памяти на этой инстанции — поднимаем на сессию.
SET maintenance_work_mem = '128MB';

-- 1) Генерируемая tsvector-колонка: section_title (вес A) + content (вес B).
ALTER TABLE public.rag_chunks
  ADD COLUMN IF NOT EXISTS content_fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(section_title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(content, '')), 'B')
  ) STORED;

-- 2) GIN-индекс для быстрого полнотекстового поиска.
CREATE INDEX IF NOT EXISTS rag_chunks_content_fts_idx
  ON public.rag_chunks USING gin (content_fts);

-- 3) Гибридный RPC: FTS + вектор, Reciprocal Rank Fusion.
--    query_embedding опционален (NULL → только FTS, для работы без Jina).
CREATE OR REPLACE FUNCTION public.hybrid_rag_chunks(
  query_text text,
  query_embedding vector DEFAULT NULL,
  match_count integer DEFAULT 6,
  filter_categories text[] DEFAULT NULL,
  filter_articles text[] DEFAULT NULL,
  full_text_weight double precision DEFAULT 1.0,
  semantic_weight double precision DEFAULT 1.0,
  rrf_k integer DEFAULT 50
)
RETURNS TABLE(
  id text,
  content text,
  category text,
  schedule_articles text[],
  target_category text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH fts AS (
    SELECT c.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(c.content_fts, websearch_to_tsquery('russian', query_text)) DESC
           ) AS rank_ix
    FROM rag_chunks c
    WHERE NOT c.is_foundational
      AND query_text IS NOT NULL
      AND c.content_fts @@ websearch_to_tsquery('russian', query_text)
      AND (filter_categories IS NULL OR c.category = ANY(filter_categories))
      AND (filter_articles  IS NULL OR c.schedule_articles && filter_articles)
    ORDER BY rank_ix
    LIMIT LEAST(match_count, 30) * 2
  ),
  vec AS (
    SELECT c.id,
           row_number() OVER (ORDER BY c.embedding <=> query_embedding) AS rank_ix
    FROM rag_chunks c
    WHERE c.embedding IS NOT NULL
      AND query_embedding IS NOT NULL
      AND NOT c.is_foundational
      AND (filter_categories IS NULL OR c.category = ANY(filter_categories))
      AND (filter_articles  IS NULL OR c.schedule_articles && filter_articles)
    ORDER BY rank_ix
    LIMIT LEAST(match_count, 30) * 2
  ),
  fused AS (
    SELECT
      coalesce(fts.id, vec.id) AS id,
      coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight
        + coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight AS score
    FROM fts
    FULL OUTER JOIN vec ON fts.id = vec.id
  )
  SELECT c.id, c.content, c.category, c.schedule_articles, c.target_category,
         f.score AS similarity
  FROM fused f
  JOIN rag_chunks c ON c.id = f.id
  ORDER BY f.score DESC
  LIMIT match_count;
$function$;

GRANT EXECUTE ON FUNCTION public.hybrid_rag_chunks(text, vector, integer, text[], text[], double precision, double precision, integer)
  TO anon, authenticated, service_role;
