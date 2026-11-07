import { createLlmProvider, LlmError, type LlmProvider } from "@fico/llm";

/**
 * Embedding dimension — must match the column width in
 * packages/db/sql/user_chunks.sql.
 *
 * Google AI (text-embedding-004) produces 768 dimensions,
 * OpenAI (text-embedding-3-small) produces 1536.
 */
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? "") || 768;

export type EmbedOutcome =
  | { ok: true; vector: number[] }
  | {
      ok: false;
      reason: "missing_api_key" | "api_error" | "empty_embedding";
      detail?: string;
    };

let cachedProvider: LlmProvider | null = null;

function provider(): LlmProvider | null {
  if (cachedProvider) return cachedProvider;
  try {
    cachedProvider = createLlmProvider(process.env).provider;
    return cachedProvider;
  } catch {
    // No credentials configured yet — the caller turns this into a skip.
    return null;
  }
}

/**
 * Returns a dense embedding vector, or a skip signal when no provider key is
 * configured.
 */
export async function embed(text: string): Promise<EmbedOutcome> {
  return embedBatch([text]).then((outcome) =>
    outcome.ok
      ? { ok: true, vector: outcome.vectors[0]! }
      : { ok: false, reason: outcome.reason, detail: outcome.detail },
  );
}

export type EmbedBatchOutcome =
  | { ok: true; vectors: number[][] }
  | {
      ok: false;
      reason: "missing_api_key" | "api_error" | "empty_embedding";
      detail?: string;
    };

/**
 * Embeds several texts in one provider request. The ingestion loop embeds
 * every chunk of a document, so batching removes one round trip per chunk.
 */
export async function embedBatch(texts: string[]): Promise<EmbedBatchOutcome> {
  const usable = texts.map((text) => text.trim()).filter((text) => text.length > 0);
  if (usable.length === 0) {
    return { ok: false, reason: "empty_embedding" };
  }

  const llm = provider();
  if (!llm) {
    console.warn(
      "[embed] no LLM provider configured (GEMINI_API_KEY / OPENAI_API_KEY) — chunk skipped",
    );
    return { ok: false, reason: "missing_api_key" };
  }

  try {
    const response = await llm.embed({ texts: usable, kind: "document" });
    const vectors = response.vectors;

    if (!vectors.length) {
      return { ok: false, reason: "empty_embedding" };
    }

    const wrongDimension = vectors.find(
      (vector) => vector.length !== EMBEDDING_DIMENSION,
    );
    if (wrongDimension) {
      console.warn(
        `[embed] dimension mismatch: got ${wrongDimension.length}, expected ${EMBEDDING_DIMENSION} — chunks skipped`,
      );
      return {
        ok: false,
        reason: "empty_embedding",
        detail: `dimension ${wrongDimension.length} != ${EMBEDDING_DIMENSION}`,
      };
    }

    return { ok: true, vectors };
  } catch (caught) {
    if (caught instanceof LlmError) {
      console.warn("[embed] provider error:", caught.reason, caught.message);
      return { ok: false, reason: "api_error", detail: caught.message };
    }
    console.warn("[embed] unexpected error:", caught);
    return { ok: false, reason: "api_error" };
  }
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
