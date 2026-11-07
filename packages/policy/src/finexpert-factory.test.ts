import { describe, expect, it } from "vitest";
import { createFinexpertSchnittstelle } from "./finexpert-factory.js";
import {
  BcaClient,
  BlauDirektClient,
  FinexpertRestClient,
  FrankeBornbergClient,
  MvpSyncClient,
  TaaClient,
} from "./finexpert-schnittstellen.js";

describe("createFinexpertSchnittstelle", () => {
  const config = {
    baseUrl: "https://api.finexpert.de/api/v1",
    clientId: "id",
    clientSecret: "secret",
  };

  it("builds all finexpert.de/schnittstellen clients", () => {
    expect(createFinexpertSchnittstelle("FINEXPERT_REST", config)).toBeInstanceOf(
      FinexpertRestClient,
    );
    expect(createFinexpertSchnittstelle("BLAU_DIREKT", config)).toBeInstanceOf(
      BlauDirektClient,
    );
    expect(createFinexpertSchnittstelle("BCA", config)).toBeInstanceOf(BcaClient);
    expect(
      createFinexpertSchnittstelle("FRANKE_BORNBERG", config),
    ).toBeInstanceOf(FrankeBornbergClient);
    expect(createFinexpertSchnittstelle("TAA", config)).toBeInstanceOf(TaaClient);
    expect(createFinexpertSchnittstelle("MVP", config)).toBeInstanceOf(
      MvpSyncClient,
    );
  });
});
