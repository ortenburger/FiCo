import type { FastifyInstance } from "fastify";
import { prisma } from "@fico/db";
import { z } from "zod";
import { extractDocumentPages } from "./document-text.js";
import { fileNameFromObjectKey, presignGetObject, readS3Env } from "./s3.js";

const DEFAULT_MAX_CHARS = 6000;
const MAX_PAGES_PER_CALL = 5;

export type SelectedPage = { page: number; text: string };

export type PageSelection = {
  pages: SelectedPage[];
  firstPage: number;
  lastPage: number;
  truncated: boolean;
  nextPage: number | null;
};

function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pageCount));
}

/**
 * Picks the pages a single voice turn should read.
 *
 * The voice agent cannot receive a 40-page contract at once, so a call reads
 * a small window (three pages by default) and reports where to continue.
 */
export function selectPages(
  pages: string[],
  options: {
    page?: number;
    pageFrom?: number;
    pageTo?: number;
    maxChars?: number;
  } = {},
): PageSelection {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const pageCount = pages.length;

  const firstPage =
    options.page !== undefined
      ? clampPage(options.page, pageCount)
      : clampPage(options.pageFrom ?? 1, pageCount);

  const requestedEnd =
    options.page !== undefined
      ? firstPage
      : clampPage(options.pageTo ?? firstPage + 2, pageCount);
  const lastPage = Math.max(firstPage, requestedEnd);

  const selected: SelectedPage[] = [];
  let usedChars = 0;
  let truncated = false;

  for (let page = firstPage; page <= lastPage; page += 1) {
    if (selected.length >= MAX_PAGES_PER_CALL) {
      truncated = true;
      break;
    }

    const remaining = maxChars - usedChars;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const text = pages[page - 1] ?? "";
    if (text.length > remaining) {
      selected.push({ page, text: text.slice(0, remaining) });
      truncated = true;
      break;
    }

    selected.push({ page, text });
    usedChars += text.length;
  }

  const actualLast = selected[selected.length - 1]?.page ?? firstPage;
  const nextPage = actualLast < pageCount ? actualLast + 1 : null;

  return {
    pages: selected,
    firstPage,
    lastPage: actualLast,
    truncated: truncated || nextPage !== null,
    nextPage,
  };
}

export type PageMatch = { page: number; snippet: string };

/** Case-insensitive substring search with a small context window. */
export function findPages(
  pages: string[],
  query: string,
  limit = 5,
): PageMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: PageMatch[] = [];
  for (const [index, text] of pages.entries()) {
    const haystack = text.toLowerCase();
    const at = haystack.indexOf(needle);
    if (at < 0) continue;

    const start = Math.max(0, at - 120);
    const end = Math.min(text.length, at + needle.length + 160);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    matches.push({
      page: index + 1,
      snippet: `${prefix}${text.slice(start, end).replace(/\s+/g, " ")}${suffix}`,
    });

    if (matches.length >= limit) break;
  }
  return matches;
}

const listQuery = z.object({
  userId: z.string().uuid(),
});

const readBody = z.object({
  userId: z.string().uuid(),
  /** Explicit document id from list_documents. */
  policyId: z.string().uuid().optional(),
  /** Free-text hint: file name, provider or policy number. */
  document: z.string().min(1).max(255).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageFrom: z.coerce.number().int().positive().optional(),
  pageTo: z.coerce.number().int().positive().optional(),
  /** Search instead of reading a range; returns page snippets. */
  query: z.string().min(1).max(200).optional(),
  maxChars: z.coerce.number().int().min(500).max(20000).optional(),
});

type PolicyRow = {
  id: string;
  providerName: string;
  policyNumber: string | null;
  policyType: string;
  rawDocumentS3Key: string | null;
  documentStatus: string;
  createdAt: Date;
};

function toDocumentSummary(policy: PolicyRow) {
  return {
    policyId: policy.id,
    fileName: policy.rawDocumentS3Key
      ? fileNameFromObjectKey(policy.rawDocumentS3Key)
      : null,
    providerName: policy.providerName,
    policyNumber: policy.policyNumber,
    policyType: policy.policyType,
    documentStatus: policy.documentStatus,
    uploadedAt: policy.createdAt.toISOString(),
  };
}

export async function registerDocumentReadRoutes(
  app: FastifyInstance,
): Promise<void> {
  /** All uploaded policy documents of one user. */
  app.get("/v1/documents", async (req, reply) => {
    const { userId } = listQuery.parse(req.query);

    const policies = await prisma.insurancePolicy.findMany({
      where: { userId, rawDocumentS3Key: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        providerName: true,
        policyNumber: true,
        policyType: true,
        rawDocumentS3Key: true,
        documentStatus: true,
        createdAt: true,
      },
    });

    const documents = policies.map(toDocumentSummary);

    return {
      userId,
      count: documents.length,
      documents,
      hint:
        documents.length === 0
          ? "Noch kein Dokument im Tresor. Lade zuerst eine Police als PDF hoch."
          : "read_document mit policyId aufrufen, um den Text zu lesen.",
    };
  });

  /**
   * Direct PDF read: extracts the document text from the vault and returns it
   * page by page. This is deliberately not RAG — no embeddings, no vector
   * search, just the requested pages in reading order.
   */
  app.post("/v1/documents/read", async (req, reply) => {
    const body = readBody.parse(req.body);

    const policies = await prisma.insurancePolicy.findMany({
      where: {
        userId: body.userId,
        rawDocumentS3Key: { not: null },
        ...(body.policyId ? { id: body.policyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        providerName: true,
        policyNumber: true,
        policyType: true,
        rawDocumentS3Key: true,
        documentStatus: true,
        createdAt: true,
      },
    });

    if (policies.length === 0) {
      return reply.code(404).send({
        error:
          "Kein hochgeladenes Dokument gefunden. Lade im Tresor zuerst eine Police hoch.",
        userId: body.userId,
      });
    }

    let policy = policies[0]!;
    if (body.document) {
      const needle = body.document.trim().toLowerCase();
      const matching = policies.filter((candidate) => {
        const fileName = candidate.rawDocumentS3Key
          ? fileNameFromObjectKey(candidate.rawDocumentS3Key).toLowerCase()
          : "";
        return (
          fileName.includes(needle) ||
          candidate.providerName.toLowerCase().includes(needle) ||
          (candidate.policyNumber ?? "").toLowerCase().includes(needle)
        );
      });

      if (matching.length > 0) {
        policy = matching[0]!;
      } else if (policies.length > 1) {
        return reply.code(404).send({
          error: `Kein Dokument passt zu „${body.document}".`,
          available: policies.map(toDocumentSummary),
        });
      }
    }

    let s3;
    try {
      s3 = readS3Env();
    } catch (err) {
      return reply.code(503).send({
        error: err instanceof Error ? err.message : "S3 not configured",
      });
    }

    let buffer: Buffer;
    try {
      const url = presignGetObject({
        env: s3,
        objectKey: policy.rawDocumentS3Key!,
      });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return reply.code(502).send({
          error: `Dokument konnte nicht aus dem Tresor gelesen werden (S3 ${response.status}).`,
          detail: detail.slice(0, 200),
        });
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      return reply.code(502).send({
        error: "Dokument konnte nicht aus dem Tresor gelesen werden.",
        detail: err instanceof Error ? err.message : "S3 request failed",
      });
    }

    const extracted = await extractDocumentPages(buffer);
    const document = {
      ...toDocumentSummary(policy),
      pageCount: extracted.pageCount,
      source: extracted.source,
    };

    if (extracted.pages.every((page) => page.length === 0)) {
      return reply.code(422).send({
        error:
          extracted.warning ??
          "Das Dokument enthält keinen maschinenlesbaren Text.",
        document,
      });
    }

    if (body.query) {
      const matches = findPages(extracted.pages, body.query);
      return {
        document,
        query: body.query,
        matchCount: matches.length,
        matches,
        hint:
          matches.length === 0
            ? `Kein Treffer für „${body.query}". Andere Formulierung versuchen oder Seiten lesen.`
            : "read_document mit page aufrufen, um eine Trefferseite vollständig zu lesen.",
      };
    }

    const selection = selectPages(extracted.pages, {
      page: body.page,
      pageFrom: body.pageFrom,
      pageTo: body.pageTo,
      maxChars: body.maxChars,
    });

    return {
      document,
      pages: selection.pages,
      firstPage: selection.firstPage,
      lastPage: selection.lastPage,
      truncated: selection.truncated,
      nextPage: selection.nextPage,
      hint:
        selection.nextPage !== null
          ? `Weiter mit pageFrom=${selection.nextPage} (oder page=${selection.nextPage}).`
          : "Letzte Seite erreicht.",
    };
  });
}
