/**
 * § 48b VAG — No hidden kickbacks.
 *
 * The schema must not track broker commissions paid to users.
 * Platform revenue is advisory fee (§ 34d Abs. 2 GewO) or software
 * service fee (§ 34d Abs. 1 GewO) only.
 */
/** Forbidden table / entity name patterns — statically audited in tests */
export const FORBIDDEN_KICKBACK_ENTITIES = [
    "user_commission_payouts",
    "broker_kickbacks",
    "provision_share_to_user",
    "courtage_refund",
    "kickback_ledger",
];
export function assertAllowedFeeType(feeType) {
    if (feeType !== "ADVISORY_FEE" && feeType !== "SOFTWARE_SERVICE_FEE") {
        throw new Error(`Invalid fee type "${feeType}". Only ADVISORY_FEE or SOFTWARE_SERVICE_FEE permitted (§ 48b VAG).`);
    }
}
export function isForbiddenKickbackEntity(name) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
    return FORBIDDEN_KICKBACK_ENTITIES.includes(normalized);
}
//# sourceMappingURL=vag-invariants.js.map