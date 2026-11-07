import type { FinanzminingHttp } from "./http.js";
import type {
  CategorizationOptions,
  FinanzminingAccount,
  FinanzminingTransaction,
} from "./types.js";

/**
 * Enrichment / process bricks that feed contract identification & analytics:
 * - push accounts & transactions
 * - run categorization / subscription detection
 * - upload documents (policy PDFs etc.)
 *
 * Does NOT expose cashback / voucher / retention-partner kickback APIs (§ 48b VAG).
 */
export class EnrichmentConnector {
  constructor(private readonly http: FinanzminingHttp) {}

  uploadAccounts(accounts: unknown[]): Promise<{ identifiers?: unknown[] }> {
    return this.http.post("/accounts", { accounts });
  }

  uploadTransactions(
    transactions: unknown[],
  ): Promise<{ identifiers?: unknown[] }> {
    return this.http.post("/transactions", { transactions });
  }

  listAccounts(query: Record<string, string | number | boolean | undefined> = {}): Promise<{
    accounts?: FinanzminingAccount[];
  }> {
    return this.http.get("/accounts", query);
  }

  listTransactions(query: Record<string, string | number | boolean | undefined> = {}): Promise<{
    transactions?: FinanzminingTransaction[];
  }> {
    return this.http.get("/transactions", query);
  }

  /**
   * POST /categorization — async job: classify txs + detect subscriptions/contracts.
   * Poll GET /accounts for status after start.
   */
  startCategorization(options: CategorizationOptions = {}): Promise<unknown> {
    return this.http.post("/categorization", undefined, { ...options });
  }

  /**
   * POST /catsaction — synchronous categorization of an uploaded transaction batch.
   */
  categorizeTransactions(payload: {
    transactions: unknown[];
  }): Promise<{ transactions?: FinanzminingTransaction[] }> {
    return this.http.post("/catsaction", payload);
  }

  /**
   * POST /documents — multipart upload (filename + filecontent).
   */
  async uploadDocument(params: {
    filename: string;
    content: Blob | ArrayBuffer | Uint8Array | Buffer;
    contentType?: string;
  }): Promise<{ identifiers?: unknown[] }> {
    const form = new FormData();
    form.append("filename", params.filename);
    const blob =
      params.content instanceof Blob
        ? params.content
        : new Blob([params.content as BlobPart], {
            type: params.contentType ?? "application/octet-stream",
          });
    form.append("filecontent", blob, params.filename);
    return this.http.request("POST", "/documents", {
      formData: form,
      requireUserToken: true,
    });
  }
}
