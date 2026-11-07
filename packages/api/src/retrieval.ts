import type { FastifyInstance } from "fastify";
import { prisma } from "@fico/db";
import { z } from "zod";

const EMBEDDING_DIMENSION = 1536;

const retrievalBodySchema = z.object({
  userId: z.string().uuid(),
  question: z.string().min(1).max(4000),
});

type EmbedOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: "missing_api_key" | "api_error" | "empty_embedding" };

async function embedQuestion(text: string): Promise<EmbedOutcome> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty_embedding" };

  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.EMBEDDING_API_KEY?.trim();
  if (!apiKey) {
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
    return { ok: false, reason: "api_error" };
  }

  const payload = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vector = payload.data?.[0]?.embedding;
  if (!vector?.length || vector.length !== EMBEDDING_DIMENSION) {
    return { ok: false, reason: "empty_embedding" };
  }

  return { ok: true, vector };
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function registerRetrievalRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/v1/retrieval", async (req, reply) => {
    const body = retrievalBodySchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true },
    });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const embedded = await embedQuestion(body.question);
    if (!embedded.ok) {
      return {
        userId: body.userId,
        chunks: [] as string[],
        searchable: false,
        reason:
          embedded.reason === "missing_api_key"
            ? "No embedding API key configured (OPENAI_API_KEY / EMBEDDING_API_KEY)."
            : "Could not embed question.",
      };
    }

    const queryVec = vectorLiteral(embedded.vector);
    const limit = Number(process.env.RETRIEVAL_TOP_K ?? 8);

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${body.userId}, true)`;
      return tx.$queryRaw<Array<{ content: string; policy_id: string }>>`
        SELECT content, policy_id::text AS policy_id
        FROM document_chunks
        WHERE user_id = ${body.userId}::uuid
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${queryVec}::vector
        LIMIT ${limit}
      `;
    });

    return {
      userId: body.userId,
      chunks: rows.map((r) => r.content),
      policyIds: [...new Set(rows.map((r) => r.policy_id))],
      searchable: true,
    };
  });
}
