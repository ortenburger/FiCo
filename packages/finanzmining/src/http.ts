/**
 * cashbuzz / finanzmining HTTP transport.
 * Auth: x-api-Key (client) + Authorization: Bearer (user access token)
 * Base: https://api.cashbuzz.io/v01
 */

export const DEFAULT_FINNANZMINING_BASE_URL = "https://api.cashbuzz.io/v01";

export interface FinanzminingHttpConfig {
  baseUrl?: string;
  /** Client API key → header x-api-Key */
  apiKey: string;
  /** User access token → Authorization: Bearer */
  userAccessToken?: string;
  fetchImpl?: typeof fetch;
}

export class FinanzminingHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "FinanzminingHttpError";
  }
}

export class FinanzminingHttp {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly userAccessToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: FinanzminingHttpConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_FINNANZMINING_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.apiKey = config.apiKey;
    this.userAccessToken = config.userAccessToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  withUserToken(token: string): FinanzminingHttp {
    return new FinanzminingHttp({ ...this.config, userAccessToken: token });
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      query?: Record<string, string | number | boolean | undefined | null>;
      body?: unknown;
      formData?: FormData;
      requireUserToken?: boolean;
    },
  ): Promise<T> {
    if (options?.requireUserToken === true && !this.config.userAccessToken) {
      throw new Error("finanzmining userAccessToken required");
    }

    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "x-api-Key": this.config.apiKey,
      Accept: "application/json",
    };
    if (this.config.userAccessToken) {
      headers.Authorization = `Bearer ${this.config.userAccessToken}`;
    }

    let body: BodyInit | undefined;
    if (options?.formData) {
      body = options.formData;
    } else if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const res = await this.fetchImpl(url, { method, headers, body });
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
      throw new FinanzminingHttpError(
        `finanzmining ${method} ${path} → HTTP ${res.status}`,
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }

  get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    return this.request<T>("GET", path, { query, requireUserToken: true });
  }

  post<T>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    return this.request<T>("POST", path, {
      body,
      query,
      requireUserToken: true,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body, requireUserToken: true });
  }

  delete<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    return this.request<T>("DELETE", path, { query, requireUserToken: true });
  }
}
