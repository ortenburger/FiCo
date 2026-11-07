-- Per-user document chunks for RAG (pgvector on existing Postgres / Timescale PG16)
--
-- The embedding dimension must match the configured provider:
--   Google AI (text-embedding-004) -> 768
--   OpenAI (text-embedding-3-small) -> 1536
-- Change EMBEDDING_DIMENSION in .env before applying, then run the
-- ALTER below if the column already exists with a different width.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    policy_id  UUID NOT NULL REFERENCES insurance_policies (id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    embedding  vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Switch the column to the dimension the configured provider produces.
-- Example for Gemini:
--   ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE document_chunks
    ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);

CREATE INDEX IF NOT EXISTS document_chunks_user_id_idx
    ON document_chunks (user_id);

CREATE INDEX IF NOT EXISTS document_chunks_policy_id_idx
    ON document_chunks (policy_id);

-- Cosine distance (<=>); used by ORDER BY embedding <=> query
DROP INDEX IF EXISTS document_chunks_embedding_hnsw_idx;

CREATE INDEX document_chunks_embedding_hnsw_idx
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_chunks_app_user ON document_chunks;

CREATE POLICY document_chunks_app_user ON document_chunks
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
