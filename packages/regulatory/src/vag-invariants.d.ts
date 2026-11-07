/**
 * § 48b VAG — No hidden kickbacks.
 *
 * The schema must not track broker commissions paid to users.
 * Platform revenue is advisory fee (§ 34d Abs. 2 GewO) or software
 * service fee (§ 34d Abs. 1 GewO) only.
 */
/** Forbidden table / entity name patterns — statically audited in tests */
export declare const FORBIDDEN_KICKBACK_ENTITIES: readonly ["user_commission_payouts", "broker_kickbacks", "provision_share_to_user", "courtage_refund", "kickback_ledger"];
export type AllowedFeeType = "ADVISORY_FEE" | "SOFTWARE_SERVICE_FEE";
export declare function assertAllowedFeeType(feeType: string): asserts feeType is AllowedFeeType;
export declare function isForbiddenKickbackEntity(name: string): boolean;
//# sourceMappingURL=vag-invariants.d.ts.map