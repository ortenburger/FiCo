import type { Decimal } from "decimal.js";

export type MoneyInput = string | number | Decimal;

export interface PostLineInput {
  accountId: string;
  /** Positive amount applied as debit XOR credit */
  amount: MoneyInput;
  side: "debit" | "credit";
  memo?: string;
}

export interface PostJournalInput {
  userId: string;
  description: string;
  reference?: string;
  lines: PostLineInput[];
}

export interface PostedJournalResult {
  journalEntryId: string;
  accountVersions: Record<string, number>;
}

export interface AccountBalanceSnapshot {
  accountId: string;
  balanceAmount: string;
  version: number;
}

/**
 * In-memory account store used by unit tests and pure OCC simulations.
 * Production path uses Prisma inside LedgerService.
 */
export interface MutableAccountStore {
  get(accountId: string): AccountBalanceSnapshot | undefined;
  /**
   * Atomically apply delta if version matches. Returns false on OCC conflict.
   */
  compareAndSet(
    accountId: string,
    expectedVersion: number,
    nextBalance: string,
    nextVersion: number,
  ): boolean;
}
