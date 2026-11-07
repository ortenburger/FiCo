import { describe, expect, it } from "vitest";
import { evaluateWaterfall } from "./waterfall.js";

describe("evaluateWaterfall", () => {
  it("routes free cash flow to emergency reserve when below buffer", () => {
    const result = evaluateWaterfall({
      fixedCostSumLookback: "9000.00", // 3 months → M_fix = 3000
      targetBufferMonths: 3,
      accounts: [
        { type: "CHECKING", balanceAmount: "2000.00" },
        { type: "SAVINGS", balanceAmount: "1000.00" },
      ],
    });

    expect(result.monthlyFixedExpenses).toBe("3000.00");
    expect(result.targetEmergencyBuffer).toBe("9000.00");
    expect(result.currentLiquidReserve).toBe("3000.00");
    expect(result.deficit).toBe("6000.00");
    expect(result.instruction).toBe("FILL_EMERGENCY_RESERVE");
  });

  it("prioritizes high-interest debt after buffer is met", () => {
    const result = evaluateWaterfall({
      fixedCostSumLookback: "3000.00",
      targetBufferMonths: 3,
      accounts: [
        { type: "CHECKING", balanceAmount: "12000.00" },
        { type: "CREDIT_CARD", balanceAmount: "1500.00", aprPct: 12.5 },
      ],
    });

    expect(result.instruction).toBe("PAY_HIGH_INTEREST_DEBT");
    expect(result.surplus).toBe("9000.00");
  });

  it("allocates to wealth engine when buffer met and no high-APR debt", () => {
    const result = evaluateWaterfall({
      fixedCostSumLookback: "3000.00",
      targetBufferMonths: 3,
      accounts: [
        { type: "CHECKING", balanceAmount: "5000.00" },
        { type: "SAVINGS", balanceAmount: "5000.00" },
        { type: "LOAN", balanceAmount: "20000.00", aprPct: 2.5 },
      ],
    });

    expect(result.instruction).toBe("ALLOCATE_TO_WEALTH_ENGINE");
    expect(result.highInterestDebtPresent).toBe(false);
  });
});
