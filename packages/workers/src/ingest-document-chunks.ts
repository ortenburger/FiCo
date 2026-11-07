import { prisma } from "@fico/db";
import { embedBatch, vectorLiteral } from "./embed.js";
import { extractDocumentText } from "./extract-document-text.js";
import { fetchS3Object } from "./s3-get-object.js";

const CHUNK_MAX_CHARS = 1200;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const out: string[] = [];
  const paragraphs = normalized.split(/\n{2,}/);

  let buffer = "";
  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = "";
  };

  for (const para of paragraphs) {
    if (buffer.length + para.length + 2 <= CHUNK_MAX_CHARS) {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
      continue;
    }
    flush();
    if (para.length <= CHUNK_MAX_CHARS) {
      buffer = para;
    } else {
      for (let i = 0; i < para.length; i += CHUNK_MAX_CHARS) {
        out.push(para.slice(i, i + CHUNK_MAX_CHARS).trim());
      }
    }
  }
  flush();
  return out;
}

export type IngestDocumentChunksInput = {
  userId: string;
  policyId: string;
  rawDocumentS3Key: string;
  fallbackText?: string;
};

export type IngestDocumentChunksResult = {
  chunksStored: number;
  chunksSkipped: number;
  skippedReasons: string[];
  /** Non fatal problems, e.g. a scan without a text layer. */
  warnings?: string[];
  pageCount?: number;
};

export async function ingestDocumentChunks(
  input: IngestDocumentChunksInput,
): Promise<IngestDocumentChunksResult> {
  const { userId, policyId, rawDocumentS3Key, fallbackText = "" } = input;

  if (!userId || !policyId) {
    return {
      chunksStored: 0,
      chunksSkipped: 0,
      skippedReasons: ["missing userId or policyId"],
    };
  }

  let documentText = "";
  let pageCount = 1;
  const warnings: string[] = [];

  try {
    if (rawDocumentS3Key) {
      const buffer = await fetchS3Object(rawDocumentS3Key);
      const extracted = await extractDocumentText(buffer);
      documentText = extracted.text;
      pageCount = extracted.pageCount || 1;
      if (extracted.warning) {
        warnings.push(extracted.warning);
        console.warn("[document-ingestion] extraction:", extracted.warning);
      }
    }
  } catch (err) {
    console.warn("[document-ingestion] S3 read failed:", err);
    warnings.push(
      err instanceof Error ? err.message : "S3 read failed",
    );
  }

  if (!documentText.trim() && fallbackText.trim()) {
    documentText = fallbackText;
  }

  const pieces = chunkText(documentText);
  if (pieces.length === 0) {
    return {
      chunksStored: 0,
      chunksSkipped: 0,
      skippedReasons: ["no text to chunk"],
      warnings,
      pageCount,
    };
  }

  let chunksStored = 0;
  let chunksSkipped = 0;
  const skippedReasons: string[] = [];

  // Embed in batches: one provider request per batch instead of one per
  // chunk. A 40 page contract is roughly 60 chunks.
  const embedded = await embedBatch(pieces);
  if (!embedded.ok) {
    return {
      chunksStored: 0,
      chunksSkipped: pieces.length,
      skippedReasons: [`${embedded.reason}: ${embedded.detail ?? "batch failed"}`],
      warnings,
      pageCount,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`
      DELETE FROM document_chunks
      WHERE policy_id = ${policyId}::uuid AND user_id = ${userId}::uuid
    `;

    for (const [index, content] of pieces.entries()) {
      const vector = embedded.vectors[index];
      if (!vector) {
        chunksSkipped += 1;
        skippedReasons.push(`missing vector: ${content.slice(0, 48)}…`);
        continue;
      }

      const embedding = vectorLiteral(vector);
      await tx.$executeRaw`
        INSERT INTO document_chunks (user_id, policy_id, content, embedding)
        VALUES (
          ${userId}::uuid,
          ${policyId}::uuid,
          ${content},
          ${embedding}::vector
        )
      `;
      chunksStored += 1;
    }
  });

  return { chunksStored, chunksSkipped, skippedReasons, warnings, pageCount };
}
