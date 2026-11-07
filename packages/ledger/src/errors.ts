export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export class UnbalancedEntryError extends LedgerError {
  constructor(debitTotal: string, creditTotal: string) {
    super(
      `Journal entry unbalanced: debits=${debitTotal} credits=${creditTotal}`,
    );
    this.name = "UnbalancedEntryError";
  }
}

export class OptimisticConcurrencyError extends LedgerError {
  constructor(
    public readonly accountId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `OCC conflict on account ${accountId}: expected version ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = "OptimisticConcurrencyError";
  }
}

export class InvalidLineError extends LedgerError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLineError";
  }
}
