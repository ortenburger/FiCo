import type {
  AispAccountSnapshot,
  AispConnector,
  AispTransactionPage,
} from "./adapter.js";

export interface WealthapiClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

/**
 * wealthAPI depot connector — READ ONLY holdings / snapshots.
 */
export class WealthapiConnector implements AispConnector {
  readonly name = "WEALTHAPI" as const;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | null = null;

  constructor(private readonly config: WealthapiClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetchAccounts(params: {
    externalConsentId: string;
  }): Promise<AispAccountSnapshot[]> {
    const token = await this.getToken();
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/v1/depots?consentId=${encodeURIComponent(params.externalConsentId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`wealthAPI depots HTTP ${res.status}`);
    const body = (await res.json()) as {
      depots?: Array<Record<string, unknown>>;
    };
    return (body.depots ?? []).map((d) => ({
      externalAccountId: String(d.id ?? ""),
      currency: String(d.currency ?? "EUR"),
      balanceAmount: String(d.marketValue ?? d.balance ?? "0"),
      type: "DEPOT" as const,
    }));
  }

  async fetchTransactions(params: {
    externalConsentId: string;
    sinceBookingDate: string;
    cursor?: string;
  }): Promise<AispTransactionPage> {
    const token = await this.getToken();
    const qs = new URLSearchParams({
      consentId: params.externalConsentId,
      since: params.sinceBookingDate,
    });
    if (params.cursor) qs.set("cursor", params.cursor);
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/v1/depot-transactions?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`wealthAPI transactions HTTP ${res.status}`);
    const body = (await res.json()) as {
      items?: Array<Record<string, unknown>>;
      nextCursor?: string;
    };
    return {
      items: (body.items ?? []).map((t) => ({
        externalId: String(t.id ?? ""),
        bookingDate: String(t.tradeDate ?? t.bookingDate ?? ""),
        valueDate: String(t.settlementDate ?? t.tradeDate ?? ""),
        amount: String(t.amount ?? "0"),
        currency: String(t.currency ?? "EUR"),
        remittanceInfo: t.isin ? `ISIN ${String(t.isin)}` : undefined,
      })),
      nextCursor: body.nextCursor,
    };
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await this.fetchImpl(`${this.config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`wealthAPI token HTTP ${res.status}`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("wealthAPI token missing");
    this.accessToken = json.access_token;
    return this.accessToken;
  }
}
