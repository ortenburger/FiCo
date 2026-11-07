import type { AccountBalanceSnapshot, MutableAccountStore, PostJournalInput, PostedJournalResult, PostLineInput } from "./types.js";
/**
 * Asset / expense accounts increase on debit.
 * Liability / equity / income increase on credit.
 * For cash/checking/savings we treat positive balance as asset (debit-positive).
 * CREDIT_CARD and LOAN balances are stored as positive outstanding liability
 * amounts; posting a credit increases the liability, debit decreases it.
 */
export type BalanceEffect = "asset" | "liability";
export declare function balanceEffectForAccountType(type: string): BalanceEffect;
export declare function applyLineToBalance(currentBalance: string, line: PostLineInput, effect: BalanceEffect): string;
export declare function validateBalanced(lines: PostLineInput[]): void;
/**
 * Pure OCC journal poster — no DB. Used by unit tests to prove race safety.
 * Aggregates net delta per account, then compare-and-sets versions sequentially.
 * On any conflict, throws OptimisticConcurrencyError (caller retries).
 */
export declare function postJournalOptimistic(store: MutableAccountStore, input: PostJournalInput, accountTypes: Record<string, string>, journalEntryId?: `${string}-${string}-${string}-${string}-${string}`): PostedJournalResult;
/**
 * In-memory account store for tests / local simulation.
 */
export declare class InMemoryAccountStore implements MutableAccountStore {
    private readonly accounts;
    seed(account: AccountBalanceSnapshot): void;
    get(accountId: string): AccountBalanceSnapshot | undefined;
    compareAndSet(accountId: string, expectedVersion: number, nextBalance: string, nextVersion: number): boolean;
}
//# sourceMappingURL=double-entry.d.ts.map