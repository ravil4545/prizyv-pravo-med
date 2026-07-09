-- SecondBrain RAG quality pipeline:
--   * private serving tables (all reads go through edge functions);
--   * traceable chunks with source/build metadata;
--   * staging + atomic publication of complete or targeted builds;
--   * richer hybrid search results and article/category filters.

ALTER TABLE public.rag_chunks
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS chunk_index integer,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS build_id uuid,
  ADD COLUMN IF NOT EXISTS source_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.rag_chunks
SET source_path = split_part(id, '#s', 1)
WHERE source_path IS NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_source_path_idx
  ON public.rag_chunks (source_path);
CREATE INDEX IF NOT EXISTS rag_chunks_content_hash_idx
  ON public.rag_chunks (content_hash);
CREATE INDEX IF NOT EXISTS rag_chunks_category_articles_idx
  ON public.rag_chunks (category)
  WHERE schedule_articles IS NOT NULL;

-- Include source title and tags in lexical retrieval. Keep the legacy
-- content_fts column intact in case another production object references it.
DROP FUNCTION IF EXISTS public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer
);
DROP FUNCTION IF EXISTS public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer, double precision
);
ALTER TABLE public.rag_chunks
  ADD COLUMN IF NOT EXISTS search_fts tsvector;

CREATE OR REPLACE FUNCTION public.set_rag_chunks_search_fts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.search_fts :=
    setweight(to_tsvector('russian', coalesce(NEW.source_title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(NEW.section_title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rag_chunks_search_fts_update ON public.rag_chunks;
CREATE TRIGGER rag_chunks_search_fts_update
BEFORE INSERT OR UPDATE OF source_title, section_title, tags, content
ON public.rag_chunks
FOR EACH ROW
EXECUTE FUNCTION public.set_rag_chunks_search_fts();

UPDATE public.rag_chunks
SET search_fts =
  setweight(to_tsvector('russian', coalesce(source_title, '')), 'A') ||
  setweight(to_tsvector('russian', coalesce(section_title, '')), 'A') ||
  setweight(to_tsvector('russian', coalesce(array_to_string(tags, ' '), '')), 'B') ||
  setweight(to_tsvector('russian', coalesce(content, '')), 'C')
WHERE search_fts IS NULL;

CREATE INDEX IF NOT EXISTS rag_chunks_search_fts_idx
  ON public.rag_chunks USING gin (search_fts);

CREATE TABLE IF NOT EXISTS public.rag_builds (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('full', 'targeted')),
  status text NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging', 'published', 'failed')),
  expected_chunks integer,
  staged_chunks integer,
  published_chunks integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.rag_chunks_staging (
  build_id uuid NOT NULL REFERENCES public.rag_builds(id) ON DELETE CASCADE,
  id text NOT NULL,
  content text NOT NULL,
  embedding vector(1024),
  category text,
  tags text[],
  schedule_articles text[],
  target_category text,
  priority text,
  type text,
  is_foundational boolean NOT NULL DEFAULT false,
  section_title text,
  last_refined text,
  source_path text NOT NULL,
  source_title text NOT NULL,
  chunk_index integer NOT NULL,
  content_hash text NOT NULL,
  source_modified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, id)
);

CREATE INDEX IF NOT EXISTS rag_chunks_staging_build_idx
  ON public.rag_chunks_staging (build_id);

ALTER TABLE public.rag_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_chunks_staging ENABLE ROW LEVEL SECURITY;

-- Atomic publication: readers see either the previous complete build or the
-- new complete build. A failed embedding/upload never empties production.
CREATE OR REPLACE FUNCTION public.publish_rag_build(
  p_build_id uuid,
  p_expected_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staged integer;
  v_published integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('secondbrain-rag-publish'));

  SELECT count(*) INTO v_staged
  FROM public.rag_chunks_staging
  WHERE build_id = p_build_id;

  IF v_staged <> p_expected_count OR v_staged < 1 THEN
    RAISE EXCEPTION 'RAG build % has % staged chunks, expected %',
      p_build_id, v_staged, p_expected_count;
  END IF;

  DELETE FROM public.rag_chunks WHERE true;
  INSERT INTO public.rag_chunks (
    id, content, embedding, category, tags, schedule_articles,
    target_category, priority, type, is_foundational, section_title,
    last_refined, source_path, source_title, chunk_index, content_hash,
    build_id, source_modified_at, created_at, updated_at
  )
  SELECT
    id, content, embedding, category, tags, schedule_articles,
    target_category, priority, type, is_foundational, section_title,
    last_refined, source_path, source_title, chunk_index, content_hash,
    build_id, source_modified_at, now(), now()
  FROM public.rag_chunks_staging
  WHERE build_id = p_build_id;

  GET DIAGNOSTICS v_published = ROW_COUNT;
  UPDATE public.rag_builds
  SET status = 'published', staged_chunks = v_staged,
      published_chunks = v_published, published_at = now(), error = NULL
  WHERE id = p_build_id;
  DELETE FROM public.rag_chunks_staging WHERE build_id = p_build_id;

  RETURN v_published;
END;
$function$;

-- Targeted publication replaces all chunks of every staged source in one
-- transaction. It removes obsolete tail chunks when a note becomes shorter.
CREATE OR REPLACE FUNCTION public.publish_rag_sources(
  p_build_id uuid,
  p_expected_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staged integer;
  v_published integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('secondbrain-rag-publish'));

  SELECT count(*) INTO v_staged
  FROM public.rag_chunks_staging
  WHERE build_id = p_build_id;

  IF v_staged <> p_expected_count OR v_staged < 1 THEN
    RAISE EXCEPTION 'Targeted RAG build % has % staged chunks, expected %',
      p_build_id, v_staged, p_expected_count;
  END IF;

  DELETE FROM public.rag_chunks active
  WHERE active.source_path IN (
    SELECT DISTINCT source_path
    FROM public.rag_chunks_staging
    WHERE build_id = p_build_id
  );

  INSERT INTO public.rag_chunks (
    id, content, embedding, category, tags, schedule_articles,
    target_category, priority, type, is_foundational, section_title,
    last_refined, source_path, source_title, chunk_index, content_hash,
    build_id, source_modified_at, created_at, updated_at
  )
  SELECT
    id, content, embedding, category, tags, schedule_articles,
    target_category, priority, type, is_foundational, section_title,
    last_refined, source_path, source_title, chunk_index, content_hash,
    build_id, source_modified_at, now(), now()
  FROM public.rag_chunks_staging
  WHERE build_id = p_build_id;

  GET DIAGNOSTICS v_published = ROW_COUNT;
  UPDATE public.rag_builds
  SET status = 'published', staged_chunks = v_staged,
      published_chunks = v_published, published_at = now(), error = NULL
  WHERE id = p_build_id;
  DELETE FROM public.rag_chunks_staging WHERE build_id = p_build_id;

  RETURN v_published;
END;
$function$;

DROP FUNCTION IF EXISTS public.match_rag_chunks(vector, integer, double precision);
DROP FUNCTION IF EXISTS public.match_rag_chunks(vector, integer, double precision, text[], text[]);
CREATE FUNCTION public.match_rag_chunks(
  query_embedding vector(1024),
  match_count integer DEFAULT 5,
  min_similarity double precision DEFAULT 0.20,
  filter_categories text[] DEFAULT NULL,
  filter_articles text[] DEFAULT NULL
)
RETURNS TABLE(
  id text,
  content text,
  category text,
  section_title text,
  schedule_articles text[],
  target_category text,
  priority text,
  source_path text,
  source_title text,
  content_hash text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    c.id, c.content, c.category, c.section_title, c.schedule_articles,
    c.target_category, c.priority, c.source_path, c.source_title,
    c.content_hash,
    (1 - (c.embedding <=> query_embedding))::double precision AS similarity
  FROM public.rag_chunks c
  WHERE query_embedding IS NOT NULL
    AND c.embedding IS NOT NULL
    AND NOT c.is_foundational
    AND (filter_categories IS NULL OR c.category = ANY(filter_categories))
    AND (filter_articles IS NULL OR c.schedule_articles && filter_articles)
    AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT greatest(match_count, 1);
$function$;

DROP FUNCTION IF EXISTS public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer
);
DROP FUNCTION IF EXISTS public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer, double precision
);
CREATE FUNCTION public.hybrid_rag_chunks(
  query_text text,
  query_embedding vector(1024) DEFAULT NULL,
  match_count integer DEFAULT 6,
  filter_categories text[] DEFAULT NULL,
  filter_articles text[] DEFAULT NULL,
  full_text_weight double precision DEFAULT 1.0,
  semantic_weight double precision DEFAULT 1.0,
  rrf_k integer DEFAULT 50,
  min_similarity double precision DEFAULT 0.20
)
RETURNS TABLE(
  id text,
  content text,
  category text,
  section_title text,
  schedule_articles text[],
  target_category text,
  priority text,
  source_path text,
  source_title text,
  content_hash text,
  similarity double precision,
  semantic_similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH input AS (
    SELECT trim(
      coalesce(query_text, '') ||
      CASE
        WHEN position('контрольн' in lower(coalesce(query_text, ''))) > 0
          AND position('освидетельств' in lower(coalesce(query_text, ''))) > 0
          AND position('кмо' in lower(coalesce(query_text, ''))) = 0
          THEN ' кмо'
        WHEN position('кмо' in lower(coalesce(query_text, ''))) > 0
          AND position('освидетельств' in lower(coalesce(query_text, ''))) = 0
          THEN ' контрольное медицинское освидетельствование'
        ELSE ''
      END
    ) AS expanded_query
  ),
  q AS (
    SELECT
      to_tsquery(
        'russian',
        nullif(
          array_to_string(
            tsvector_to_array(to_tsvector('russian', expanded_query)),
            ' | '
          ),
          ''
        )
      ) AS tsq,
      tsvector_to_array(to_tsvector('russian', expanded_query)) AS lexemes
    FROM input
  ),
  fts_raw AS (
    SELECT
      c.id,
      ts_rank_cd(c.search_fts, q.tsq) AS rank_score,
      (
        SELECT count(*)::integer
        FROM unnest(q.lexemes) AS lexeme
        WHERE lexeme = ANY(tsvector_to_array(c.search_fts))
      ) AS lexeme_overlap
    FROM public.rag_chunks c, q
    WHERE NOT c.is_foundational
      AND q.tsq IS NOT NULL
      AND c.search_fts @@ q.tsq
      AND (filter_categories IS NULL OR c.category = ANY(filter_categories))
      AND (filter_articles IS NULL OR c.schedule_articles && filter_articles)
  ),
  fts AS (
    SELECT
      id,
      row_number() OVER (
        ORDER BY lexeme_overlap DESC, rank_score DESC, id
      ) AS rank_ix
    FROM fts_raw
    ORDER BY lexeme_overlap DESC, rank_score DESC, id
    LIMIT greatest(least(match_count * 4, 60), match_count)
  ),
  vec AS (
    SELECT
      c.id,
      row_number() OVER (ORDER BY c.embedding <=> query_embedding, c.id) AS rank_ix,
      (1 - (c.embedding <=> query_embedding))::double precision AS cosine
    FROM public.rag_chunks c
    WHERE query_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND NOT c.is_foundational
      AND (filter_categories IS NULL OR c.category = ANY(filter_categories))
      AND (filter_articles IS NULL OR c.schedule_articles && filter_articles)
      AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
    ORDER BY rank_ix
    LIMIT greatest(least(match_count * 4, 60), match_count)
  ),
  fused AS (
    SELECT
      coalesce(fts.id, vec.id) AS id,
      coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) * full_text_weight
        + coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0) * semantic_weight AS score,
      vec.cosine
    FROM fts
    FULL OUTER JOIN vec ON fts.id = vec.id
  )
  SELECT
    c.id, c.content, c.category, c.section_title, c.schedule_articles,
    c.target_category, c.priority, c.source_path, c.source_title,
    c.content_hash, f.score AS similarity, f.cosine AS semantic_similarity
  FROM fused f
  JOIN public.rag_chunks c ON c.id = f.id
  ORDER BY f.score DESC, f.cosine DESC NULLS LAST, c.id
  LIMIT greatest(match_count, 1);
$function$;

-- Serving data is proprietary and may contain internal, anonymized practice.
-- Browser clients never need direct table/RPC access: edge functions use the
-- service role and enforce the public/internal category profiles.
DROP POLICY IF EXISTS "Public read rag_chunks" ON public.rag_chunks;
DROP POLICY IF EXISTS "Public read rag_system_context" ON public.rag_system_context;
REVOKE ALL ON public.rag_chunks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rag_system_context FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rag_builds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rag_chunks_staging FROM PUBLIC, anon, authenticated;
DO $block$
BEGIN
  IF to_regclass('public.rag_index') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.rag_index FROM PUBLIC, anon, authenticated';
  END IF;
END;
$block$;

REVOKE EXECUTE ON FUNCTION public.match_rag_chunks(vector, integer, double precision, text[], text[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer, double precision
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_rag_build(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_rag_sources(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_rag_chunks_search_fts()
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rag_chunks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rag_system_context TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rag_builds TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rag_chunks_staging TO service_role;
GRANT EXECUTE ON FUNCTION public.match_rag_chunks(vector, integer, double precision, text[], text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_rag_chunks(
  text, vector, integer, text[], text[], double precision,
  double precision, integer, double precision
) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_rag_build(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_rag_sources(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_rag_chunks_search_fts() TO service_role;
