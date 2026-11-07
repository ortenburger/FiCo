/**
 * finexpert Schnittstellen clients
 * @see https://www.finexpert.de/schnittstellen/
 *
 * Covers: REST API, blau direkt, BCA AG, Franke & Bornberg, TAA, MVP-Systeme
 */

import {
  CircuitBreaker,
  exponentialBackoffMs,
} from "./circuit-breaker.js";

export interface FinexpertAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  circuitBreaker?: CircuitBreaker;
}

async function oauthToken(
  config: FinexpertAuthConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`finexpert token HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("finexpert token missing");
  return body.access_token;
}

abstract class FinexpertHttpClient {
  protected readonly fetchImpl: typeof fetch;
  protected readonly breaker: CircuitBreaker;
  private accessToken: string | null = null;

  constructor(protected readonly config: FinexpertAuthConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.breaker = config.circuitBreaker ?? new CircuitBreaker();
  }

  protected async request<T>(
    path: string,
    init?: RequestInit,
    retries = 3,
  ): Promise<T> {
    return this.breaker.exec(async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const token = await this.ensureToken();
          const res = await this.fetchImpl(
            `${this.config.baseUrl.replace(/\/$/, "")}${path}`,
            {
              ...init,
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...(init?.headers ?? {}),
              },
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
          return (await res.json()) as T;
        } catch (err) {
          lastErr = err;
          if (attempt < retries) await sleep(exponentialBackoffMs(attempt));
        }
      }
      throw lastErr;
    });
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken) {
      this.accessToken = await oauthToken(this.config, this.fetchImpl);
    }
    return this.accessToken;
  }
}

/** finexpert REST API — kunden, risikocheck, webhooks */
export class FinexpertRestClient extends FinexpertHttpClient {
  readonly datasourceId = "FINEXPERT_REST" as const;

  getKunde(id: string) {
    return this.request<Record<string, unknown>>(`/kunden/${encodeURIComponent(id)}`);
  }

  listKunden(cursor?: string) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request<{ items: Record<string, unknown>[]; nextCursor?: string }>(
      `/kunden${qs}`,
    );
  }

  getRisikocheck(kundeId: string) {
    return this.request<Record<string, unknown>>(
      `/kunden/${encodeURIComponent(kundeId)}/risikocheck`,
    );
  }
}

/** Native two-way blau direkt pool integration */
export class BlauDirektClient extends FinexpertHttpClient {
  readonly datasourceId = "BLAU_DIREKT" as const;

  syncBestand(sinceIso?: string) {
    const qs = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : "";
    return this.request<{ policies: Record<string, unknown>[] }>(
      `/bestand/sync${qs}`,
    );
  }

  importMvp(payload: Record<string, unknown>) {
    return this.request<{ importId: string }>("/mvp/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  startAbschlussstrecke(application: Record<string, unknown>) {
    return this.request<{ applicationId: string; status: string }>(
      "/abschlussstrecke",
      { method: "POST", body: JSON.stringify(application) },
    );
  }
}

/** BCA AG — inventory, CRM, document flow */
export class BcaClient extends FinexpertHttpClient {
  readonly datasourceId = "BCA" as const;

  syncBestand(sinceIso?: string) {
    const qs = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : "";
    return this.request<{ policies: Record<string, unknown>[] }>(
      `/bestand/sync${qs}`,
    );
  }

  syncKunden() {
    return this.request<{ customers: Record<string, unknown>[] }>("/kunden/sync");
  }

  listDocuments(kundeId: string) {
    return this.request<{ documents: Record<string, unknown>[] }>(
      `/kunden/${encodeURIComponent(kundeId)}/dokumente`,
    );
  }
}

/** Franke & Bornberg fb>vertragscheck via finexpert surface */
export class FrankeBornbergClient extends FinexpertHttpClient {
  readonly datasourceId = "FRANKE_BORNBERG" as const;

  createVertragscheck(payload: {
    source_tariff: Record<string, unknown>;
    target_tariffs: Record<string, unknown>[];
    criteria_profile?: string;
  }) {
    return this.request<Record<string, unknown>>("/vertragscheck", {
      method: "POST",
      body: JSON.stringify({
        criteria_profile: "VERBRAUCHERSCHUTZ_STANDARD",
        ...payload,
      }),
    });
  }

  getVertragscheck(runId: string) {
    return this.request<Record<string, unknown>>(
      `/vertragscheck/${encodeURIComponent(runId)}`,
    );
  }
}

/** TAA tariff calculator results → advisory concept */
export class TaaClient extends FinexpertHttpClient {
  readonly datasourceId = "TAA" as const;

  runTarifrechner(payload: Record<string, unknown>) {
    return this.request<{ comparisonId: string; results: Record<string, unknown>[] }>(
      "/tarifrechner",
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  importIntoBeratungskonzept(comparisonId: string, conceptId: string) {
    return this.request<{ status: string }>("/beratungskonzept/import", {
      method: "POST",
      body: JSON.stringify({ comparisonId, conceptId }),
    });
  }
}

/** MVP / Maklerverwaltungsprogramm sync */
export class MvpSyncClient extends FinexpertHttpClient {
  readonly datasourceId = "MVP" as const;

  pushKunde(kunde: Record<string, unknown>) {
    return this.request<{ externalId: string }>("/kunden", {
      method: "POST",
      body: JSON.stringify(kunde),
    });
  }

  pullChanges(sinceIso: string) {
    return this.request<{ changes: Record<string, unknown>[] }>(
      `/sync/changes?since=${encodeURIComponent(sinceIso)}`,
    );
  }
}

export type FinexpertSchnittstelleClient =
  | FinexpertRestClient
  | BlauDirektClient
  | BcaClient
  | FrankeBornbergClient
  | TaaClient
  | MvpSyncClient;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
