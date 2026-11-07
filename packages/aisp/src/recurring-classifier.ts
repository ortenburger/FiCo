/**
 * Step 1 — Banking Aggregation & Recurring Transaction Classification
 * Read-only AISP path. Zero PISP interfaces.
 */

export type ClassifiedCategory =
  | "INCOME"
  | "FIXED_COST"
  | "VARIABLE_SPEND"
  | "SAVINGS_INVESTMENT"
  | "DEBT_SERVICE";

export interface RawTx {
  externalId: string;
  bookingDate: string; // YYYY-MM-DD
  amount: number;
  counterpartyName?: string | null;
  remittanceInfo?: string | null;
}

export interface ClassifiedTx extends RawTx {
  category: ClassifiedCategory;
  subCategory?: string;
  isRecurring: boolean;
}

/** Insurer dictionary from FL-NTOE spec */
export const INSURER_REGEX =
  /^(ALLIANZ|HUK|ERGO|AXA|GENERALI|DEBEKA|ALTE LEIPZIGER|SIGNAL IDUNA)/i;

export const RECURRING_PERIODS_DAYS = [7, 14, 30, 90, 365] as const;
export const RECURRING_TOLERANCE_DAYS = 3;

function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}

/**
 * Detect recurring outflows by amount+counterparty clustering with
 * period ∈ {7,14,30,90,365} ± 3 days.
 */
export function detectRecurring(txs: RawTx[]): Set<string> {
  const recurringIds = new Set<string>();
  const groups = new Map<string, RawTx[]>();

  for (const tx of txs) {
    if (tx.amount >= 0) continue; // outflows only
    const key = `${(tx.counterpartyName ?? "").toUpperCase()}|${Math.abs(tx.amount).toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((x, y) =>
      x.bookingDate.localeCompare(y.bookingDate),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const gap = daysBetween(prev.bookingDate, cur.bookingDate);
      const matchesPeriod = RECURRING_PERIODS_DAYS.some(
        (p) => Math.abs(gap - p) <= RECURRING_TOLERANCE_DAYS,
      );
      if (matchesPeriod) {
        recurringIds.add(prev.externalId);
        recurringIds.add(cur.externalId);
      }
    }
  }

  return recurringIds;
}

export function isInsurancePremium(tx: RawTx): boolean {
  const name = (tx.counterpartyName ?? "").trim();
  const remittance = (tx.remittanceInfo ?? "").trim();
  return INSURER_REGEX.test(name) || INSURER_REGEX.test(remittance);
}

export function classifyTransactions(txs: RawTx[]): ClassifiedTx[] {
  const recurring = detectRecurring(txs);

  return txs.map((tx) => {
    const isRecurring = recurring.has(tx.externalId);
    if (isInsurancePremium(tx) && tx.amount < 0) {
      return {
        ...tx,
        category: "FIXED_COST",
        subCategory: "INSURANCE_PREMIUM",
        isRecurring: true,
      };
    }
    if (tx.amount > 0) {
      return { ...tx, category: "INCOME", isRecurring };
    }
    if (isRecurring) {
      return { ...tx, category: "FIXED_COST", isRecurring: true };
    }
    return { ...tx, category: "VARIABLE_SPEND", isRecurring: false };
  });
}
