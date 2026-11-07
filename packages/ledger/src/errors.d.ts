export declare class LedgerError extends Error {
    constructor(message: string);
}
export declare class UnbalancedEntryError extends LedgerError {
    constructor(debitTotal: string, creditTotal: string);
}
export declare class OptimisticConcurrencyError extends LedgerError {
    readonly accountId: string;
    readonly expectedVersion: number;
    readonly actualVersion: number;
    constructor(accountId: string, expectedVersion: number, actualVersion: number);
}
export declare class InvalidLineError extends LedgerError {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map