import type { PrismaClient } from "@fico/db";
import { UnbalancedEntryError } from "./errors.js";
import type { PostJournalInput, PostedJournalResult } from "./types.js";
/**
 * Production double-entry poster.
 *
 * Invariants:
 * - Never uses SELECT … FOR UPDATE
 * - Never calls external HTTP inside the DB transaction
 * - Balance updates are version-checked (OCC); retries on conflict
 * - Journal lines are append-only; voiding creates a reversing entry
 */
export declare class LedgerService {
    private readonly db;
    constructor(db: PrismaClient);
    postJournal(input: PostJournalInput): Promise<PostedJournalResult>;
    private postJournalOnce;
}
export { UnbalancedEntryError };
//# sourceMappingURL=ledger-service.d.ts.map