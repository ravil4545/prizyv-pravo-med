-- Фикс recall: websearch_to_tsquery склеивает слова через AND — для базы знаний
-- это слишком строго (ни один чанк не содержит ВСЕ слова запроса → пусто).
-- Решение: строим tsquery из лексем самого запроса через OR ('|'), ранжируем
-- по ts_rank_cd (чанки с бОльшим числом совпавших терминов — выше). Безопасно:
-- лексемы уже нормализованы to_tsvector, спецсимволы tsquery-операторов отсутствуют.
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
  WITH q AS (
    SELECT to_tsquery(
             'russian',
             nullif(
               array_to_string(
                 tsvector_to_array(to_tsvector('russian', coalesce(query_text, ''))),
                 ' | '
               ),
               ''
             )
           ) AS tsq
  ),
  fts AS (
    SELECT c.id,
           row_number() OVER (ORDER BY ts_rank_cd(c.content_fts, q.tsq) DESC) AS rank_ix
    FROM rag_chunks c, q
    WHERE NOT c.is_foundational
      AND q.tsq IS NOT NULL
      AND c.content_fts @@ q.tsq
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
