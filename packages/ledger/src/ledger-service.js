import { Prisma } from "@fico/db";
import { InvalidLineError, OptimisticConcurrencyError, UnbalancedEntryError, } from "./errors.js";
import { applyLineToBalance, balanceEffectForAccountType, validateBalanced, } from "./double-entry.js";
import { moneyStr } from "./money.js";
const MAX_OCC_RETRIES = 5;
/**
 * Production double-entry poster.
 *
 * Invariants:
 * - Never uses SELECT … FOR UPDATE
 * - Never calls external HTTP inside the DB transaction
 * - Balance updates are version-checked (OCC); retries on conflict
 * - Journal lines are append-only; voiding creates a reversing entry
 */
export class LedgerService {
    db;
    constructor(db) {
        this.db = db;
    }
    async postJournal(input) {
        validateBalanced(input.lines);
        let lastError;
        for (let attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
            try {
                return await this.postJournalOnce(input);
            }
            catch (err) {
                if (err instanceof OptimisticConcurrencyError) {
                    lastError = err;
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }
    async postJournalOnce(input) {
        const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
        return this.db.$transaction(async (tx) => {
            const accounts = await tx.account.findMany({
                where: { id: { in: accountIds }, userId: input.userId },
            });
            if (accounts.length !== accountIds.length) {
                throw new InvalidLineError("One or more accounts missing or not owned by user");
            }
            const byId = new Map(accounts.map((a) => [a.id, a]));
            // Compute next balances from current snapshot
            const next = new Map();
            for (const a of accounts) {
                next.set(a.id, {
                    balance: a.balanceAmount,
                    version: a.version,
                    type: a.type,
                });
            }
            for (const line of input.lines) {
                const cur = next.get(line.accountId);
                const effect = balanceEffectForAccountType(cur.type);
                const newBal = applyLineToBalance(cur.balance.toFixed(2), line, effect);
                next.set(line.accountId, {
                    ...cur,
                    balance: new Prisma.Decimal(newBal),
                });
            }
            const journal = await tx.journalEntry.create({
                data: {
                    userId: input.userId,
                    description: input.description,
                    reference: input.reference,
                    status: "POSTED",
                    lines: {
                        create: input.lines.map((line) => ({
                            accountId: line.accountId,
                            debit: line.side === "debit"
                                ? new Prisma.Decimal(moneyStr(line.amount))
                                : new Prisma.Decimal(0),
                            credit: line.side === "credit"
                                ? new Prisma.Decimal(moneyStr(line.amount))
                                : new Prisma.Decimal(0),
                            memo: line.memo,
                        })),
                    },
                },
            });
            const accountVersions = {};
            // Deterministic update order
            for (const accountId of [...next.keys()].sort()) {
                const snap = byId.get(accountId);
                const target = next.get(accountId);
                const updated = await tx.account.updateMany({
                    where: { id: accountId, version: snap.version },
                    data: {
                        balanceAmount: target.balance,
                        balanceUpdatedAt: new Date(),
                        version: { increment: 1 },
                    },
                });
                if (updated.count !== 1) {
                    throw new OptimisticConcurrencyError(accountId, snap.version, snap.version + 1);
                }
                accountVersions[accountId] = snap.version + 1;
            }
            return { journalEntryId: journal.id, accountVersions };
        });
    }
}
export { UnbalancedEntryError };
//# sourceMappingURL=ledger-service.js.map