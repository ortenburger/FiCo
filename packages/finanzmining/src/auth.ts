import { FinanzminingHttp, type FinanzminingHttpConfig } from "./http.js";

export interface CreateOrLoginUserRequest {
  /** true = login existing user; false = create */
  login: boolean;
  email?: string;
  username?: string;
  password: string;
  campaign?: string;
}

export interface UserSession {
  /** Bearer token for subsequent user-scoped calls */
  accessToken: string;
  user?: Record<string, unknown>;
  raw: unknown;
}

/**
 * Client-level auth (global API key) to create/login a cashbuzz user and obtain
 * a user access token for analytics / contracts / predictions.
 */
export class AuthConnector {
  private readonly http: FinanzminingHttp;

  constructor(config: Omit<FinanzminingHttpConfig, "userAccessToken">) {
    this.http = new FinanzminingHttp({ ...config, userAccessToken: undefined });
  }

  async createOrLoginUser(
    request: CreateOrLoginUserRequest,
  ): Promise<UserSession> {
    const body: Record<string, unknown> = {
      password: request.password,
    };
    if (request.email) body.email = request.email;
    if (request.username) body.username = request.username;

    const raw = await this.http.request<Record<string, unknown>>("POST", "/users", {
      query: {
        login: request.login,
        campaign: request.campaign,
      },
      body,
      requireUserToken: false,
    });

    const accessToken = extractAccessToken(raw);
    if (!accessToken) {
      throw new Error("finanzmining login response missing access token");
    }
    return { accessToken, user: raw, raw };
  }

  async getAuthorizedUser(userAccessToken: string): Promise<Record<string, unknown>> {
    return this.http
      .withUserToken(userAccessToken)
      .get("/users/me");
  }
}

function extractAccessToken(raw: Record<string, unknown>): string | undefined {
  const candidates = [
    raw.access_token,
    raw.accessToken,
    raw.authToken,
    raw.token,
    (raw.user as Record<string, unknown> | undefined)?.access_token,
    (raw.user as Record<string, unknown> | undefined)?.token,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}
