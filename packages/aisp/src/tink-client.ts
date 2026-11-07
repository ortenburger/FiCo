import type {
  AispAccountSnapshot,
  AispConnector,
  AispTransactionPage,
} from "./adapter.js";

export interface TinkClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

/**
 * Tink AISP connector — READ ONLY (no payment initiation).
 * @see https://docs.tink.com/
 */
export class TinkConnector implements AispConnector {
  readonly name = "TINK" as const;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | null = null;

  constructor(private readonly config: TinkClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetchAccounts(params: {
    externalConsentId: string;
  }): Promise<AispAccountSnapshot[]> {
    const token = await this.getToken();
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/api/v1/accounts/list`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tink-Consent": params.externalConsentId,
        },
      },
    );
    if (!res.ok) throw new Error(`Tink accounts HTTP ${res.status}`);
    const body = (await res.json()) as {
      accounts?: Array<Record<string, unknown>>;
    };
    return (body.accounts ?? []).map(mapTinkAccount);
  }

  async fetchTransactions(params: {
    externalConsentId: string;
    sinceBookingDate: string;
    cursor?: string;
  }): Promise<AispTransactionPage> {
    const token = await this.getToken();
    const qs = new URLSearchParams({
      bookedDateGte: params.sinceBookingDate,
    });
    if (params.cursor) qs.set("pageToken", params.cursor);
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/data/v2/transactions?${qs}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tink-Consent": params.externalConsentId,
        },
      },
    );
    if (!res.ok) throw new Error(`Tink transactions HTTP ${res.status}`);
    const body = (await res.json()) as {
      transactions?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };
    return {
      items: (body.transactions ?? []).map(mapTinkTx),
      nextCursor: body.nextPageToken,
    };
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "accounts:read,transactions:read",
    });
    const res = await this.fetchImpl(`${this.config.baseUrl}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Tink token HTTP ${res.status}`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Tink token missing");
    this.accessToken = json.access_token;
    return this.accessToken;
  }
}

function mapTinkAccount(raw: Record<string, unknown>): AispAccountSnapshot {
  const balances = raw.balances as
    | { booked?: { amount?: { value?: { unscaledValue?: string; scale?: number } } } }
    | undefined;
  const amt = balances?.booked?.amount?.value;
  const balance =
    amt?.unscaledValue != null
      ? (
          Number(amt.unscaledValue) /
          10 ** Number(amt.scale ?? 2)
        ).toFixed(2)
      : "0.00";

  return {
    externalAccountId: String(raw.id ?? ""),
    iban: raw.identifiers
      ? String(
          (raw.identifiers as { iban?: string }).iban ?? "",
        ) || undefined
      : undefined,
    currency: String(
      (raw.balances as { booked?: { amount?: { currencyCode?: string } } })
        ?.booked?.amount?.currencyCode ?? "EUR",
    ),
    balanceAmount: balance,
    type: "CHECKING",
  };
}

function mapTinkTx(raw: Record<string, unknown>) {
  const amountObj = raw.amount as
    | { value?: { unscaledValue?: string; scale?: number }; currencyCode?: string }
    | undefined;
  const dates = raw.dates as
    | { booked?: string; value?: string }
    | undefined;
  const amount =
    amountObj?.value?.unscaledValue != null
      ? (
          Number(amountObj.value.unscaledValue) /
          10 ** Number(amountObj.value.scale ?? 2)
        ).toFixed(2)
      : "0.00";

  return {
    externalId: String(raw.id ?? ""),
    bookingDate: String(dates?.booked ?? raw.bookedDate ?? ""),
    valueDate: String(dates?.value ?? dates?.booked ?? ""),
    amount,
    currency: String(amountObj?.currencyCode ?? "EUR"),
    counterpartyName: raw.counterparties
      ? String(
          (raw.counterparties as Array<{ name?: string }>)[0]?.name ?? "",
        ) || undefined
      : undefined,
    remittanceInfo: raw.descriptions
      ? String(
          (raw.descriptions as { display?: string }).display ?? "",
        ) || undefined
      : undefined,
  };
}
