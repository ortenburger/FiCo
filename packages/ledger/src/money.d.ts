import { Decimal } from "decimal.js";
import type { MoneyInput } from "./types.js";
export declare function money(value: MoneyInput): Decimal;
export declare function moneyStr(value: MoneyInput): string;
export declare function assertNonNegative(value: MoneyInput, label: string): Decimal;
export { Decimal };
//# sourceMappingURL=money.d.ts.map