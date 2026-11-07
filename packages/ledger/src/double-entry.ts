import {
  InvalidLineError,
  OptimisticConcurrencyError,
  UnbalancedEntryError,
} from "./errors.js";
import { money, moneyStr } from "./money.js";
import type {
  AccountBalanceSnapshot,
  MutableAccountStore,
  PostJournalInput,
  PostedJournalResult,
  PostLineInput,
} from "./types.js";

/**
 * Asset / expense accounts increase on debit.
 * Liability / equity / income increase on credit.
 * For cash/checking/savings we treat positive balance as asset (debit-positive).
 * CREDIT_CARD and LOAN balances are stored as positive outstanding liability
 * amounts; posting a credit increases the liability, debit decreases it.
 */
export type BalanceEffect = "asset" | "liability";

export function balanceEffectForAccountType(
  type: string,
): BalanceEffect {
  if (type === "CREDIT_CARD" || type === "LOAN") return "liability";
  return "asset";
}

export function applyLineToBalance(
  currentBalance: string,
  line: PostLineInput,
  effect: BalanceEffect,
): string {
  const amt = money(line.amount);
  if (amt.lte(0)) {
    throw new InvalidLineError(`Line amount must be > 0, got ${amt.toString()}`);
  }

  const bal = money(currentBalance);
  if (effect === "asset") {
    return moneyStr(line.side === "debit" ? bal.plus(amt) : bal.minus(amt));
  }
  // liability: credit increases outstanding, debit decreases
  return moneyStr(line.side === "credit" ? bal.plus(amt) : bal.minus(amt));
}

export function validateBalanced(lines: PostLineInput[]): void {
  if (lines.length < 2) {
    throw new InvalidLineError("Journal entry requires at least two lines");
  }

  let debit = money(0);
  let credit = money(0);

  for (const line of lines) {
    const amt = money(line.amount);
    if (amt.lte(0)) {
      throw new InvalidLineError(
        `Line amount must be > 0, got ${amt.toString()}`,
      );
    }
    if (line.side === "debit") debit = debit.plus(amt);
    else credit = credit.plus(amt);
  }

  if (!debit.equals(credit)) {
    throw new UnbalancedEntryError(moneyStr(debit), moneyStr(credit));
  }
}

/**
 * Pure OCC journal poster — no DB. Used by unit tests to prove race safety.
 * Aggregates net delta per account, then compare-and-sets versions sequentially.
 * On any conflict, throws OptimisticConcurrencyError (caller retries).
 */
export function postJournalOptimistic(
  store: MutableAccountStore,
  input: PostJournalInput,
  accountTypes: Record<string, string>,
  journalEntryId = crypto.randomUUID(),
): PostedJournalResult {
  validateBalanced(input.lines);

  // Snapshot all accounts first
  const snapshots = new Map<string, AccountBalanceSnapshot>();
  for (const line of input.lines) {
    if (snapshots.has(line.accountId)) continue;
    const snap = store.get(line.accountId);
    if (!snap) {
      throw new InvalidLineError(`Unknown account ${line.accountId}`);
    }
    snapshots.set(line.accountId, snap);
  }

  // Compute next balances from snapshot
  const nextBalances = new Map<string, { balance: string; version: number }>();
  for (const [accountId, snap] of snapshots) {
    nextBalances.set(accountId, {
      balance: snap.balanceAmount,
      version: snap.version,
    });
  }

  for (const line of input.lines) {
    const current = nextBalances.get(line.accountId)!;
    const effect = balanceEffectForAccountType(
      accountTypes[line.accountId] ?? "CHECKING",
    );
    const newBal = applyLineToBalance(current.balance, line, effect);
    nextBalances.set(line.accountId, {
      balance: newBal,
      version: current.version,
    });
  }

  // Apply CAS in deterministic account-id order to reduce livelock variance
  const accountVersions: Record<string, number> = {};
  const orderedIds = [...nextBalances.keys()].sort();

  for (const accountId of orderedIds) {
    const snap = snapshots.get(accountId)!;
    const next = nextBalances.get(accountId)!;
    const nextVersion = snap.version + 1;
    const ok = store.compareAndSet(
      accountId,
      snap.version,
      next.balance,
      nextVersion,
    );
    if (!ok) {
      const actual = store.get(accountId);
      throw new OptimisticConcurrencyError(
        accountId,
        snap.version,
        actual?.version ?? -1,
      );
    }
    accountVersions[accountId] = nextVersion;
  }

  return { journalEntryId, accountVersions };
}

/**
 * In-memory account store for tests / local simulation.
 */
export class InMemoryAccountStore implements MutableAccountStore {
  private readonly accounts = new Map<string, AccountBalanceSnapshot>();

  seed(account: AccountBalanceSnapshot): void {
    this.accounts.set(account.accountId, { ...account });
  }

  get(accountId: string): AccountBalanceSnapshot | undefined {
    const a = this.accounts.get(accountId);
    return a ? { ...a } : undefined;
  }

  compareAndSet(
    accountId: string,
    expectedVersion: number,
    nextBalance: string,
    nextVersion: number,
  ): boolean {
    const current = this.accounts.get(accountId);
    if (!current || current.version !== expectedVersion) return false;
    this.accounts.set(accountId, {
      accountId,
      balanceAmount: nextBalance,
      version: nextVersion,
    });
    return true;
  }
}
