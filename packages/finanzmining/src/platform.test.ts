import { describe, expect, it, vi } from "vitest";
import {
  createFinanzminingPlatform,
  runContractIdentificationPipeline,
} from "./platform.js";
import { FinanzminingHttpError } from "./http.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FinanzminingPlatform", () => {
  it("requires api key", () => {
    expect(() =>
      createFinanzminingPlatform({ apiKey: "" }),
    ).toThrow(/FINNANZMINING_API_KEY/);
  });

  it("sends x-api-Key and Bearer on analytics/contracts/predictions calls", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-Key")).toBe("client-key");
      expect(headers.get("Authorization")).toBe("Bearer user-token");

      if (url.includes("/contracts")) {
        return jsonResponse({
          contracts: [
            {
              id: "c1",
              org_id: "o1",
              periodicity: 1200,
              start_date: "2024-01-01",
              end_date: "2026-01-01",
              transaction_count: 12,
              currency: "EUR",
              is_irregular: false,
              contract_ident: "POL-123",
              customer_ident: "KD-9",
              tariff: "BU-Netto",
            },
          ],
          paging: { page: 1 },
        });
      }
      if (url.includes("/subscriptions")) {
        return jsonResponse({ subscriptions: [], paging: { page: 1 } });
      }
      if (url.includes("/data")) {
        return jsonResponse({
          cashback_amounts: { amount_total: 0 },
          cashback_counts: { count_total: 0 },
        });
      }
      if (url.includes("/transactions") && url.includes("only_predicted=true")) {
        return jsonResponse({
          transactions: [
            {
              id: "t1",
              accountId: "a1",
              amount: -89.5,
              bankBookingDate: "2026-12-01",
              valueDate: "2026-12-01",
              predicted: true,
              subscription_id: "s1",
            },
          ],
        });
      }
      if (url.includes("/categorization")) {
        return jsonResponse({ status: "started" });
      }
      if (url.includes("/insights/liquidity/buffer/months")) {
        return jsonResponse({ date: "2026-01-01", value: 3.2 });
      }
      return jsonResponse({ error: `unexpected ${url}` }, 404);
    });

    const platform = createFinanzminingPlatform({
      apiKey: "client-key",
      userAccessToken: "user-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const contracts = await platform.contracts.listContracts();
    expect(contracts.contracts[0]?.contract_ident).toBe("POL-123");

    const stats = await platform.analytics.getStatistics();
    expect(stats.cashback_amounts.amount_total).toBe(0);

    const predicted = await platform.predictions.listPredictedTransactions();
    expect(predicted.transactions[0]?.predicted).toBe(true);

    const insight = await platform.analytics.getInsight(
      "liquidity",
      "buffer",
      "months",
    );
    expect(insight).toEqual({ date: "2026-01-01", value: 3.2 });

    const pipeline = await runContractIdentificationPipeline(platform, {});
    expect(pipeline.contracts.contracts).toHaveLength(1);
    expect(pipeline.predictedCashflows).toHaveLength(1);
  });

  it("surfaces HTTP errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: "nope" }, 401),
    );
    const platform = createFinanzminingPlatform({
      apiKey: "k",
      userAccessToken: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(platform.contracts.listContracts()).rejects.toBeInstanceOf(
      FinanzminingHttpError,
    );
  });
});
