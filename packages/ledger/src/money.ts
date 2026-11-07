import { Decimal } from "decimal.js";
import type { MoneyInput } from "./types.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function money(value: MoneyInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function moneyStr(value: MoneyInput): string {
  return money(value).toFixed(2);
}

export function assertNonNegative(value: MoneyInput, label: string): Decimal {
  const d = money(value);
  if (d.isNeg()) {
    throw new Error(`${label} must be non-negative, got ${d.toString()}`);
  }
  return d;
}

export { Decimal };
