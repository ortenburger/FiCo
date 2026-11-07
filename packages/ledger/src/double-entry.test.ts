import { describe, expect, it } from "vitest";
import {
  InMemoryAccountStore,
  postJournalOptimistic,
  validateBalanced,
} from "./double-entry.js";
import {
  OptimisticConcurrencyError,
  UnbalancedEntryError,
} from "./errors.js";

describe("validateBalanced", () => {
  it("accepts balanced two-line transfer", () => {
    expect(() =>
      validateBalanced([
        { accountId: "a", amount: "100.00", side: "debit" },
        { accountId: "b", amount: "100.00", side: "credit" },
      ]),
    ).not.toThrow();
  });

  it("rejects unbalanced entries", () => {
    expect(() =>
      validateBalanced([
        { accountId: "a", amount: "100.00", side: "debit" },
        { accountId: "b", amount: "50.00", side: "credit" },
      ]),
    ).toThrow(UnbalancedEntryError);
  });
});

describe("postJournalOptimistic OCC", () => {
  it("posts a transfer and increments versions", () => {
    const store = new InMemoryAccountStore();
    store.seed({ accountId: "checking", balanceAmount: "1000.00", version: 1 });
    store.seed({ accountId: "savings", balanceAmount: "500.00", version: 3 });

    const result = postJournalOptimistic(
      store,
      {
        userId: "u1",
        description: "Move to savings",
        lines: [
          { accountId: "savings", amount: "200.00", side: "debit" },
          { accountId: "checking", amount: "200.00", side: "credit" },
        ],
      },
      { checking: "CHECKING", savings: "SAVINGS" },
    );

    expect(store.get("checking")?.balanceAmount).toBe("800.00");
    expect(store.get("savings")?.balanceAmount).toBe("700.00");
    expect(result.accountVersions.checking).toBe(2);
    expect(result.accountVersions.savings).toBe(4);
  });

  it("fails gracefully when a concurrent writer wins the race", () => {
    const store = new InMemoryAccountStore();
    store.seed({ accountId: "checking", balanceAmount: "1000.00", version: 1 });
    store.seed({ accountId: "savings", balanceAmount: "500.00", version: 1 });

    // Simulate concurrent mutation after snapshot would have been taken:
    // wrap compareAndSet to bump version on first call for checking.
    let flipped = false;
    const original = store.compareAndSet.bind(store);
    store.compareAndSet = (id, expected, bal, ver) => {
      if (!flipped && id === "checking") {
        flipped = true;
        // Concurrent writer bumps version first
        original("checking", 1, "999.00", 2);
      }
      return original(id, expected, bal, ver);
    };

    expect(() =>
      postJournalOptimistic(
        store,
        {
          userId: "u1",
          description: "Race",
          lines: [
            { accountId: "savings", amount: "50.00", side: "debit" },
            { accountId: "checking", amount: "50.00", side: "credit" },
          ],
        },
        { checking: "CHECKING", savings: "SAVINGS" },
      ),
    ).toThrow(OptimisticConcurrencyError);
  });

  it("handles simultaneous race: exactly one of two conflicting CAS writers succeeds", () => {
    const store = new InMemoryAccountStore();
    store.seed({ accountId: "a", balanceAmount: "100.00", version: 1 });

    // Both writers snapshot version 1, then race compare-and-set
    const snapA = store.get("a")!;
    const snapB = store.get("a")!;
    expect(snapA.version).toBe(1);
    expect(snapB.version).toBe(1);

    const first = store.compareAndSet("a", snapA.version, "70.00", 2);
    const second = store.compareAndSet("a", snapB.version, "60.00", 2);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(store.get("a")).toEqual({
      accountId: "a",
      balanceAmount: "70.00",
      version: 2,
    });
  });

  it("retry after OCC conflict eventually converges", () => {
    const store = new InMemoryAccountStore();
    store.seed({ accountId: "a", balanceAmount: "1000.00", version: 1 });
    store.seed({ accountId: "b", balanceAmount: "0.00", version: 1 });

    const post = (amount: string) => {
      for (let i = 0; i < 10; i++) {
        try {
          return postJournalOptimistic(
            store,
            {
              userId: "u1",
              description: "retryable",
              lines: [
                { accountId: "b", amount, side: "debit" },
                { accountId: "a", amount, side: "credit" },
              ],
            },
            { a: "CHECKING", b: "SAVINGS" },
          );
        } catch (e) {
          if (!(e instanceof OptimisticConcurrencyError)) throw e;
        }
      }
      throw new Error("exhausted retries");
    };

    // Interleave: bump version mid-flight once, then retry succeeds
    const original = store.compareAndSet.bind(store);
    let sabotaged = false;
    store.compareAndSet = (id, expected, bal, ver) => {
      if (!sabotaged && id === "a") {
        sabotaged = true;
        original("a", 1, "1000.00", 2);
        original("b", 1, "0.00", 2);
      }
      return original(id, expected, bal, ver);
    };

    post("25.00");
    expect(store.get("a")?.balanceAmount).toBe("975.00");
    expect(store.get("b")?.balanceAmount).toBe("25.00");
  });
});
