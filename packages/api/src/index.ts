import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { evaluateInvestmentQuery } from "@fico/regulatory";
import { evaluateWaterfall } from "@fico/ledger";
import { evaluateEconomicGate, type PolicyType } from "@fico/policy";
import { evaluateScaHealth } from "@fico/aisp";
import {
  ANALYTICS_DATASOURCES,
  FINEXPERT_SCHNITTSTELLEN,
  NET_TARIFF_DATASOURCES,
  OPEN_FINANCE_DATASOURCES,
  describeDatasourceRegistry,
  getDatasource,
  isKnownDatasource,
} from "@fico/datasources";
import { createFinanzminingFromEnv } from "@fico/finanzmining";
import {
  createNetTariffConnector,
  createNetTariffConnectorsFromEnv,
  listAllNetProducts,
  type NetProductLine,
  type NetTariffProviderId,
} from "@fico/net-tariffs";
import { z } from "zod";
import { registerDemoRoutes } from "./demo.js";
import { registerDocumentRoutes } from "./documents.js";
import { registerProfileRoutes } from "./profile.js";
import { registerRetrievalRoutes } from "./retrieval.js";

const port = Number(process.env.API_PORT ?? 3000);

const app = Fastify({ logger: true });

// The Vite dev server runs on a different origin than the API, so the browser
// needs an explicit CORS grant for the voice client tools to reach /v1/*.
await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "OPTIONS"],
});

app.get("/health", async () => ({
  status: "ok",
  service: "fico-api",
  contexts: [
    "A:OpenFinance",
    "B:Ledger",
    "C:Policy",
    "Voice",
    "NetTariffs",
    "Finanzmining",
  ],
}));

/**
 * Macro allocation / WpIG firewall endpoint.
 * Specific security advice is hard-blocked.
 */
app.post("/v1/copilot/query", async (req, reply) => {
  const body = z.object({ query: z.string().min(1) }).parse(req.body);
  const decision = evaluateInvestmentQuery(body.query);
  if (!decision.allowed) {
    return reply.code(422).send(decision);
  }
  return {
    ...decision,
    response:
      "Macro allocation analysis only. Verify any portfolio changes with your broker. No specific securities recommended.",
  };
});

app.post("/v1/ledger/waterfall", async (req) => {
  const body = z
    .object({
      fixedCostSumLookback: z.union([z.string(), z.number()]),
      targetBufferMonths: z.union([z.string(), z.number()]),
      accounts: z.array(
        z.object({
          type: z.string(),
          balanceAmount: z.union([z.string(), z.number()]),
          aprPct: z.union([z.string(), z.number()]).optional(),
        }),
      ),
    })
    .parse(req.body);
  return evaluateWaterfall(body);
});

app.post("/v1/policy/economic-gate", async (req) => {
  const body = z
    .object({
      policyType: z.string(),
      subscriptionTier: z.enum(["FREE", "ACTIVE_SUBSCRIBER"]),
    })
    .parse(req.body);
  return evaluateEconomicGate({
    policyType: body.policyType as PolicyType,
    subscriptionTier: body.subscriptionTier,
  });
});

app.get("/v1/aisp/sca-health", async (req) => {
  const q = z
    .object({
      scaValidUntil: z.string(),
      lastBookingDate: z.string().optional(),
    })
    .parse(req.query);
  return evaluateScaHealth({
    scaValidUntil: new Date(q.scaValidUntil),
    lastBookingDate: q.lastBookingDate ? new Date(q.lastBookingDate) : null,
  });
});

/** All registered datasources */
app.get("/v1/datasources", async () => ({
  openFinance: OPEN_FINANCE_DATASOURCES,
  finexpertSchnittstellen: FINEXPERT_SCHNITTSTELLEN,
  analytics: ANALYTICS_DATASOURCES,
  netTariffs: NET_TARIFF_DATASOURCES,
  catalogUrl: "https://www.finexpert.de/schnittstellen/",
  finanzminingDocs: "https://finanzmining.de",
  honorarkonzept: "https://www.honorarkonzept.de/start.html",
  confee: "https://www.confee.de/",
  items: describeDatasourceRegistry(),
}));

app.get("/v1/datasources/:id", async (req, reply) => {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  if (!isKnownDatasource(id)) {
    return reply.code(404).send({ error: "Unknown datasource", id });
  }
  return getDatasource(id);
});

/** finanzmining — contract identification */
app.get("/v1/finanzmining/contracts", async (req, reply) => {
  try {
    const platform = createFinanzminingFromEnv();
    const q = z
      .object({
        classes: z.string().optional(),
        org_id: z.string().optional(),
        page: z.coerce.number().optional(),
        perPage: z.coerce.number().optional(),
      })
      .parse(req.query);
    return await platform.contracts.listContracts(q);
  } catch (err) {
    return reply.code(503).send({
      error: err instanceof Error ? err.message : "finanzmining unavailable",
    });
  }
});

/** finanzmining — analytics statistics */
app.get("/v1/finanzmining/statistics", async (_req, reply) => {
  try {
    const platform = createFinanzminingFromEnv();
    return await platform.analytics.getStatistics();
  } catch (err) {
    return reply.code(503).send({
      error: err instanceof Error ? err.message : "finanzmining unavailable",
    });
  }
});

/** finanzmining — predicted transactions */
app.get("/v1/finanzmining/predictions/transactions", async (req, reply) => {
  try {
    const platform = createFinanzminingFromEnv();
    const q = z
      .object({
        minBankBookingDate: z.string().optional(),
        maxBankBookingDate: z.string().optional(),
        perPage: z.coerce.number().optional(),
      })
      .parse(req.query);
    return await platform.predictions.listPredictedTransactions(q);
  } catch (err) {
    return reply.code(503).send({
      error: err instanceof Error ? err.message : "finanzmining unavailable",
    });
  }
});

/** Aggregated Nettoprodukte — HonorarKonzept + con.fee */
app.get("/v1/net-tariffs/products", async (req) => {
  const q = z
    .object({
      provider: z.enum(["HONORARKONZEPT", "CONFEE"]).optional(),
      line: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().optional(),
    })
    .parse(req.query);

  const connectors = q.provider
    ? [createNetTariffConnector(q.provider as NetTariffProviderId)]
    : createNetTariffConnectorsFromEnv();

  const products = await listAllNetProducts(connectors, {
    line: q.line as NetProductLine | undefined,
    search: q.search,
    limit: q.limit,
  });
  return { count: products.length, products };
});

app.post("/v1/net-tariffs/compare", async (req) => {
  const body = z
    .object({
      provider: z.enum(["HONORARKONZEPT", "CONFEE"]).default("CONFEE"),
      grossAnnualCost: z.number(),
      netAnnualCost: z.number(),
      advisoryFeeAnnual: z.number(),
      years: z.number().int().positive(),
      discountRate: z.number().optional(),
    })
    .parse(req.body);
  const connector = createNetTariffConnector(body.provider);
  return connector.compareAdvantage(body);
});

app.post("/v1/net-tariffs/applications/handoff", async (req) => {
  const body = z
    .object({
      provider: z.enum(["HONORARKONZEPT", "CONFEE"]),
      productId: z.string(),
      applicant: z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email(),
        birthDate: z.string().optional(),
      }),
      insuredSum: z.number().optional(),
      monthlyPremium: z.number().optional(),
    })
    .parse(req.body);
  const connector = createNetTariffConnector(body.provider);
  return connector.handoffApplication({
    ...body,
    executionOnly: true,
  });
});

await registerProfileRoutes(app);
await registerDocumentRoutes(app);
await registerRetrievalRoutes(app);
await registerDemoRoutes(app);

// Listen on both loopback stacks. "localhost" resolves to the IPv6 loopback
// first on macOS, so an IPv4-only listener is not reachable by every client.
await app.listen({ port, host: "0.0.0.0" });
