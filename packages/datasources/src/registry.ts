import {
  FINEXPERT_SCHNITTSTELLEN,
  OPEN_FINANCE_DATASOURCES,
  type DatasourceId,
  getDatasource,
} from "./catalog.js";
import {
  credentialsFromEnv,
  resolveBaseUrl,
  type EnvMap,
} from "./config.js";

export interface DatasourceRuntimeStatus {
  id: DatasourceId;
  displayName: string;
  domain: string;
  configured: boolean;
  baseUrl: string;
  readOnly: boolean;
  capabilities: readonly string[];
}

/** Snapshot of all registered datasources + whether credentials are present. */
export function describeDatasourceRegistry(
  env: EnvMap = process.env as EnvMap,
): DatasourceRuntimeStatus[] {
  const ids: DatasourceId[] = [
    ...OPEN_FINANCE_DATASOURCES,
    ...FINEXPERT_SCHNITTSTELLEN,
  ];

  return ids.map((id) => {
    const def = getDatasource(id);
    const creds = credentialsFromEnv(id, env);
    const configured = Boolean(
      creds.clientId ||
        creds.apiKey ||
        creds.partnerLicenseKey ||
        creds.webhookSecret,
    );
    return {
      id,
      displayName: def.displayName,
      domain: def.domain,
      configured,
      baseUrl: resolveBaseUrl(id, env),
      readOnly: def.readOnly,
      capabilities: def.capabilities,
    };
  });
}

export function assertOpenFinanceReadOnly(id: DatasourceId): void {
  if (!OPEN_FINANCE_DATASOURCES.includes(id)) {
    throw new Error(`${id} is not an Open Finance datasource`);
  }
  const def = getDatasource(id);
  if (!def.readOnly) {
    throw new Error(`${id} must be read-only (no PISP)`);
  }
}
