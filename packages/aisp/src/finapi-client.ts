import type {
  AispAccountSnapshot,
  AispConnector,
  AispTransactionPage,
} from "./adapter.js";

export interface FinapiClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

/**
 * finAPI AISP connector — READ ONLY (no payment initiation).
 * @see https://documentation.finapi.io/
 */
export class FinapiConnector implements AispConnector {
  readonly name = "FINAPI" as const;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | null = null;

  constructor(private readonly config: FinapiClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetchAccounts(params: {
    externalConsentId: string;
  }): Promise<AispAccountSnapshot[]> {
    const token = await this.getToken();
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/api/v2/accounts?accessConsentId=${encodeURIComponent(params.externalConsentId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`finAPI accounts HTTP ${res.status}`);
    const body = (await res.json()) as {
      accounts?: Array<Record<string, unknown>>;
    };
    return (body.accounts ?? []).map(mapFinapiAccount);
  }

  async fetchTransactions(params: {
    externalConsentId: string;
    sinceBookingDate: string;
    cursor?: string;
  }): Promise<AispTransactionPage> {
    const token = await this.getToken();
    const qs = new URLSearchParams({
      accessConsentId: params.externalConsentId,
      minBookingDate: params.sinceBookingDate,
    });
    if (params.cursor) qs.set("page", params.cursor);
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/api/v2/transactions?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`finAPI transactions HTTP ${res.status}`);
    const body = (await res.json()) as {
      transactions?: Array<Record<string, unknown>>;
      paging?: { page?: number; pageCount?: number };
    };
    const page = body.paging?.page ?? 1;
    const pageCount = body.paging?.pageCount ?? 1;
    return {
      items: (body.transactions ?? []).map(mapFinapiTx),
      nextCursor: page < pageCount ? String(page + 1) : undefined,
    };
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const res = await this.fetchImpl(`${this.config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`finAPI token HTTP ${res.status}`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("finAPI token missing");
    this.accessToken = json.access_token;
    return this.accessToken;
  }
}

function mapFinapiAccount(raw: Record<string, unknown>): AispAccountSnapshot {
  return {
    externalAccountId: String(raw.id ?? raw.accountId ?? ""),
    iban: raw.iban ? String(raw.iban) : undefined,
    currency: String(raw.accountCurrency ?? raw.currency ?? "EUR"),
    balanceAmount: String(
      (raw.balance as { availableCashAmount?: number })?.availableCashAmount ??
        raw.balance ??
        "0",
    ),
    type: mapAccountType(String(raw.accountType ?? "Checking")),
  };
}

function mapFinapiTx(raw: Record<string, unknown>) {
  return {
    externalId: String(raw.id ?? raw.transactionId ?? ""),
    bookingDate: String(raw.bankBookingDate ?? raw.bookingDate ?? ""),
    valueDate: String(raw.valueDate ?? raw.bankBookingDate ?? ""),
    amount: String(raw.amount ?? "0"),
    currency: String(raw.currency ?? "EUR"),
    counterpartyName: raw.counterpartName
      ? String(raw.counterpartName)
      : undefined,
    counterpartyIban: raw.counterpartIban
      ? String(raw.counterpartIban)
      : undefined,
    remittanceInfo: raw.purpose ? String(raw.purpose) : undefined,
  };
}

function mapAccountType(
  t: string,
): AispAccountSnapshot["type"] {
  const u = t.toUpperCase();
  if (u.includes("SAV")) return "SAVINGS";
  if (u.includes("CREDIT") || u.includes("CARD")) return "CREDIT_CARD";
  if (u.includes("LOAN")) return "LOAN";
  if (u.includes("DEPOT") || u.includes("SECURITY")) return "DEPOT";
  return "CHECKING";
}
