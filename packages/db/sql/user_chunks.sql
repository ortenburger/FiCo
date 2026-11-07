-- Per-user document chunks for RAG (pgvector on existing Postgres / Timescale PG16)
-- Apply manually, e.g. psql "$DATABASE_URL" -f packages/db/sql/user_chunks.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    policy_id  UUID NOT NULL REFERENCES insurance_policies (id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    embedding  vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS document_chunks_user_id_idx
    ON document_chunks (user_id);

CREATE INDEX IF NOT EXISTS document_chunks_policy_id_idx
    ON document_chunks (policy_id);

-- Cosine distance (<=>); used by ORDER BY embedding <=> query
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_chunks_app_user ON document_chunks;

CREATE POLICY document_chunks_app_user ON document_chunks
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
