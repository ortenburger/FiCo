import { Decimal } from "decimal.js";
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export function money(value) {
    return value instanceof Decimal ? value : new Decimal(value);
}
export function moneyStr(value) {
    return money(value).toFixed(2);
}
export function assertNonNegative(value, label) {
    const d = money(value);
    if (d.isNeg()) {
        throw new Error(`${label} must be non-negative, got ${d.toString()}`);
    }
    return d;
}
export { Decimal };
//# sourceMappingURL=money.js.map