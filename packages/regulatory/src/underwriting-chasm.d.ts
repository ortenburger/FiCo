/**
 * Failure Mode 1 — Underwriting Chasm (BU Net-Switch Trap)
 *
 * State machine lock: cancellation letters are prohibited until a
 * cryptographically verified POLICY_ISSUED status is confirmed.
 */
export type SwitchStatus = "DRAFT" | "SYNOPSIS_COMPLETE" | "APPLICATION_SUBMITTED" | "UNDERWRITING" | "POLICY_ISSUED" | "CANCELLATION_ALLOWED" | "CANCELLED" | "REJECTED_UNDERWRITING";
export declare class IllegalStateTransitionError extends Error {
    readonly from: SwitchStatus;
    readonly to: SwitchStatus;
    constructor(from: SwitchStatus, to: SwitchStatus);
}
export declare class CancellationLockedError extends Error {
    readonly status: SwitchStatus;
    constructor(status: SwitchStatus);
}
export declare function assertTransition(from: SwitchStatus, to: SwitchStatus): void;
export declare function canGenerateCancellationLetter(status: SwitchStatus): boolean;
/**
 * Advance to CANCELLATION_ALLOWED only when issued confirmation hash is present.
 */
export declare function unlockCancellation(params: {
    status: SwitchStatus;
    issuedConfirmationHash: string | null | undefined;
}): SwitchStatus;
export declare function generateCancellationLetterOrThrow(status: SwitchStatus): {
    allowed: true;
    templateKey: "CANCELLATION_LETTER_V1";
};
//# sourceMappingURL=underwriting-chasm.d.ts.map