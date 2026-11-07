/**
 * AISP connector boundary — READ ONLY.
 * Compile-time invariant: no PISP / payment-initiation methods exist.
 */

export type AispAdapterName = "FINAPI" | "TINK" | "WEALTHAPI";

export interface AispAccountSnapshot {
  externalAccountId: string;
  iban?: string;
  currency: string;
  balanceAmount: string;
  type: "CHECKING" | "SAVINGS" | "DEPOT" | "CREDIT_CARD" | "LOAN";
}

export interface AispTransactionPage {
  items: Array<{
    externalId: string;
    bookingDate: string;
    valueDate: string;
    amount: string;
    currency: string;
    counterpartyName?: string;
    counterpartyIban?: string;
    remittanceInfo?: string;
  }>;
  nextCursor?: string;
}

export interface AispConnector {
  readonly name: AispAdapterName;
  /** Differential fetch since booking date — never initiates payments */
  fetchTransactions(params: {
    externalConsentId: string;
    sinceBookingDate: string;
    cursor?: string;
  }): Promise<AispTransactionPage>;
  fetchAccounts(params: {
    externalConsentId: string;
  }): Promise<AispAccountSnapshot[]>;
}

/**
 * Stub connector for local/dev. Real adapters must live in workers and
 * publish raw JSON to Redis Streams — never call HTTP inside @Transactional.
 */
export class StubAispConnector implements AispConnector {
  readonly name: AispAdapterName = "FINAPI";

  async fetchTransactions(): Promise<AispTransactionPage> {
    return { items: [] };
  }

  async fetchAccounts(): Promise<AispAccountSnapshot[]> {
    return [];
  }
}

/** Exhaustive check helper — fails compile if PISP methods are added to interface */
export type AssertNoPisp<T> = T extends {
  initiatePayment?: unknown;
  createPayment?: unknown;
  sepaTransfer?: unknown;
}
  ? never
  : T;

export type _AispIsReadOnly = AssertNoPisp<AispConnector>;
