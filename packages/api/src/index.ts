import Fastify from "fastify";
import { evaluateInvestmentQuery } from "@fico/regulatory";
import { evaluateWaterfall } from "@fico/ledger";
import { evaluateEconomicGate, type PolicyType } from "@fico/policy";
import { evaluateScaHealth } from "@fico/aisp";
import { z } from "zod";

const port = Number(process.env.API_PORT ?? 3000);

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "fico-api",
  contexts: ["A:OpenFinance", "B:Ledger", "C:Policy"],
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

await app.listen({ port, host: "0.0.0.0" });
