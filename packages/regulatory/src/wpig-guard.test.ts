import { describe, expect, it } from "vitest";
import {
  buildExecutionOnlyDeepLink,
  evaluateInvestmentQuery,
} from "./wpig-guard.js";

describe("evaluateInvestmentQuery § 2 Abs. 2 Nr. 4 WpIG", () => {
  it("blocks specific ISIN buy/sell recommendations", () => {
    const d = evaluateInvestmentQuery(
      "Should I sell my Deka Fund and buy A1JX52?",
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.code).toBe("WPIG_SPECIFIC_SECURITY_BLOCK");
      expect(d.message).toContain("licensed investment advisor");
    }
  });

  it("blocks full ISIN switch prompts", () => {
    const d = evaluateInvestmentQuery(
      "Please switch IE00B4L5Y983 into my depot",
    );
    expect(d.allowed).toBe(false);
  });

  it("allows macro allocation analysis", () => {
    const d = evaluateInvestmentQuery(
      "Is my equity ratio too high relative to a 70/30 target?",
    );
    expect(d).toEqual({ allowed: true, mode: "MACRO_ALLOCATION" });
  });
});

describe("buildExecutionOnlyDeepLink", () => {
  it("builds empty-ticket partner deep links", () => {
    const link = buildExecutionOnlyDeepLink(
      "scalable",
      "IE00B4L5Y983",
    );
    expect(link).toContain("IE00B4L5Y983");
    expect(link).not.toMatch(/quantity|order|side=buy/i);
  });
});
