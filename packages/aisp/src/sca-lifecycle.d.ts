/**
 * Failure Mode 3 — 90/180-Day SCA Wall
 *
 * Grace-period flagging when consent/SCA data goes stale.
 */
export type ScaHealth = {
    status: "HEALTHY";
    scaValidUntil: Date;
} | {
    status: "WARNING_STALE_TX";
    scaValidUntil: Date;
    lastBookingAgeDays: number;
} | {
    status: "EXPIRED";
    scaValidUntil: Date;
    autoModeDisabled: true;
};
export declare const STALE_TX_WARNING_DAYS = 7;
export declare function evaluateScaHealth(params: {
    scaValidUntil: Date;
    lastBookingDate: Date | null;
    now?: Date;
}): ScaHealth;
//# sourceMappingURL=sca-lifecycle.d.ts.map