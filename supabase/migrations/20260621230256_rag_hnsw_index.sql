-- IVFFlat → HNSW: лучше recall/латентность для cosine-поиска, без тюнинга lists.
-- На ~1.2k векторах (1024 dims) строится мгновенно.
SET maintenance_work_mem = '128MB';

DROP INDEX IF EXISTS public.rag_chunks_embedding_idx;

CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
