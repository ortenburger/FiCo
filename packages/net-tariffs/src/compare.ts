import type {
  NetAdvantageCompareRequest,
  NetAdvantageCompareResult,
} from "./types.js";

/**
 * Deterministic gross-vs-net advantage math used by HonorarKonzept / con.fee
 * Vorteilsrechner-style comparisons. Advisory fee is explicit (§ 34d / § 48b).
 */
export function compareNetAdvantage(
  request: NetAdvantageCompareRequest,
  feeType: NetAdvantageCompareResult["feeType"] = "ADVISORY_FEE",
): NetAdvantageCompareResult {
  const annualProductSavings = request.grossAnnualCost - request.netAnnualCost;
  const annualNetOfAdvisory = annualProductSavings - request.advisoryFeeAnnual;
  const r = request.discountRate ?? 0.03;

  let npv = 0;
  for (let t = 1; t <= request.years; t++) {
    npv += annualNetOfAdvisory / (1 + r) ** t;
  }

  let breakEvenYears: number | null = null;
  if (annualNetOfAdvisory > 0) {
    let cum = 0;
    for (let y = 1; y <= request.years; y++) {
      cum += annualNetOfAdvisory;
      if (cum >= 0 && breakEvenYears === null) {
        // fee already netted annually-wise; break-even vs staying on gross is year 1 if positive
        breakEvenYears = y;
        break;
      }
    }
    if (breakEvenYears === null && annualProductSavings > request.advisoryFeeAnnual) {
      breakEvenYears = 1;
    }
  } else if (annualProductSavings > 0 && request.advisoryFeeAnnual > 0) {
    breakEvenYears =
      Math.ceil(request.advisoryFeeAnnual / annualProductSavings) || null;
  }

  return {
    annualProductSavings: round2(annualProductSavings),
    annualNetOfAdvisory: round2(annualNetOfAdvisory),
    npvSavings: round2(npv),
    breakEvenYears,
    feeType,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
