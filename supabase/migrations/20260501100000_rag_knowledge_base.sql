-- RAG Knowledge Base: vector search for nepriziv.ru AI consultant
-- Requires pgvector extension

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table for knowledge base chunks (~160 chunks from 96 .md files)
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1024),
    category TEXT,
    tags TEXT[],
    schedule_articles TEXT[],
    target_category TEXT,
    priority TEXT,
    type TEXT,
    is_foundational BOOLEAN DEFAULT false,
    section_title TEXT,
    last_refined TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. IVFFlat index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
    ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- 4. Table for the 5 foundational files (always included in system prompt)
CREATE TABLE IF NOT EXISTS rag_system_context (
    name TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS: public read (edge function uses service role which bypasses RLS anyway)
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_system_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read rag_chunks" ON rag_chunks
    FOR SELECT USING (true);

CREATE POLICY "Public read rag_system_context" ON rag_system_context
    FOR SELECT USING (true);

-- 6. Semantic search function (excludes foundational files from retrieval — they're in system prompt)
CREATE OR REPLACE FUNCTION match_rag_chunks(
    query_embedding vector(1024),
    match_count INT DEFAULT 5,
    min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id TEXT,
    content TEXT,
    category TEXT,
    schedule_articles TEXT[],
    target_category TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content,
        c.category,
        c.schedule_articles,
        c.target_category,
        (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
    FROM rag_chunks c
    WHERE
        NOT c.is_foundational
        AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
