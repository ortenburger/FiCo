import type { NetTariffPartnerConfig } from "./types.js";

export class NetTariffHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "NetTariffHttpError";
  }
}

/**
 * Partner-portal HTTP helper. Public APIs are not published; when credentials
 * are present we call partner endpoints, otherwise connectors fall back to
 * curated catalog stubs + deep-links.
 */
export class NetTariffHttp {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: NetTariffPartnerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get hasCredentials(): boolean {
    return Boolean(
      this.config.partnerLicenseKey ||
        this.config.apiKey ||
        (this.config.clientId && this.config.clientSecret),
    );
  }

  async request<T>(
    method: string,
    path: string,
    options?: { query?: Record<string, string | undefined>; body?: unknown },
  ): Promise<T> {
    const url = new URL(
      `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
    );
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) headers["X-API-Key"] = this.config.apiKey;
    if (this.config.partnerLicenseKey) {
      headers["X-Partner-License"] = this.config.partnerLicenseKey;
    }
    if (this.config.clientId && this.config.clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString("base64")}`;
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      throw new NetTariffHttpError(
        `net-tariff ${method} ${path} → HTTP ${res.status}`,
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }
}
