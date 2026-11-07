export class LedgerError extends Error {
    constructor(message) {
        super(message);
        this.name = "LedgerError";
    }
}
export class UnbalancedEntryError extends LedgerError {
    constructor(debitTotal, creditTotal) {
        super(`Journal entry unbalanced: debits=${debitTotal} credits=${creditTotal}`);
        this.name = "UnbalancedEntryError";
    }
}
export class OptimisticConcurrencyError extends LedgerError {
    accountId;
    expectedVersion;
    actualVersion;
    constructor(accountId, expectedVersion, actualVersion) {
        super(`OCC conflict on account ${accountId}: expected version ${expectedVersion}, got ${actualVersion}`);
        this.accountId = accountId;
        this.expectedVersion = expectedVersion;
        this.actualVersion = actualVersion;
        this.name = "OptimisticConcurrencyError";
    }
}
export class InvalidLineError extends LedgerError {
    constructor(message) {
        super(message);
        this.name = "InvalidLineError";
    }
}
//# sourceMappingURL=errors.js.map