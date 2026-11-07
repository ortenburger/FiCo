/** Embedding dimension — must match packages/db/sql/user_chunks.sql */
export const EMBEDDING_DIMENSION = 1536;

export type EmbedOutcome =
  | { ok: true; vector: number[] }
  | {
      ok: false;
      reason: "missing_api_key" | "api_error" | "empty_embedding";
      detail?: string;
    };

function embeddingApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY ?? process.env.EMBEDDING_API_KEY;
  return key?.trim() || undefined;
}

/**
 * Returns a dense embedding vector, or a skip signal when no provider key is configured.
 */
export async function embed(text: string): Promise<EmbedOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty_embedding" };
  }

  const apiKey = embeddingApiKey();
  if (!apiKey) {
    console.warn(
      "[embed] OPENAI_API_KEY / EMBEDDING_API_KEY unset — chunk skipped (empty embedding marker)",
    );
    return { ok: false, reason: "missing_api_key" };
  }

  const model =
    process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const baseUrl =
    process.env.EMBEDDING_BASE_URL?.replace(/\/$/, "") ||
    "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: trimmed }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    console.warn("[embed] provider error:", res.status, detail.slice(0, 200));
    return { ok: false, reason: "api_error", detail };
  }

  const payload = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vector = payload.data?.[0]?.embedding;
  if (!vector?.length) {
    console.warn("[embed] provider returned empty embedding — chunk skipped");
    return { ok: false, reason: "empty_embedding" };
  }

  if (vector.length !== EMBEDDING_DIMENSION) {
    console.warn(
      `[embed] dimension mismatch: got ${vector.length}, expected ${EMBEDDING_DIMENSION} — chunk skipped`,
    );
    return { ok: false, reason: "empty_embedding" };
  }

  return { ok: true, vector };
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
