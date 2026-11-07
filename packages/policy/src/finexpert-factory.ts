import type { FinexpertAuthConfig } from "./finexpert-schnittstellen.js";
import {
  BcaClient,
  BlauDirektClient,
  FinexpertRestClient,
  FrankeBornbergClient,
  MvpSyncClient,
  TaaClient,
  type FinexpertSchnittstelleClient,
} from "./finexpert-schnittstellen.js";
import { FinexpertClient } from "./finexpert-client.js";

export type FinexpertDatasourceId =
  | "FINEXPERT_REST"
  | "BLAU_DIREKT"
  | "BCA"
  | "FRANKE_BORNBERG"
  | "TAA"
  | "MVP";

export function createFinexpertSchnittstelle(
  id: FinexpertDatasourceId,
  config: FinexpertAuthConfig,
): FinexpertSchnittstelleClient {
  switch (id) {
    case "FINEXPERT_REST":
      return new FinexpertRestClient(config);
    case "BLAU_DIREKT":
      return new BlauDirektClient(config);
    case "BCA":
      return new BcaClient(config);
    case "FRANKE_BORNBERG":
      return new FrankeBornbergClient(config);
    case "TAA":
      return new TaaClient(config);
    case "MVP":
      return new MvpSyncClient(config);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown finexpert datasource: ${_exhaustive}`);
    }
  }
}

/** Synopsis-oriented F&B wrapper (economic-gate gated path). */
export function createFrankeBornbergSynopsisClient(config: FinexpertAuthConfig) {
  return new FinexpertClient(config);
}
