/**
 * Failure Mode 1 — Underwriting Chasm (BU Net-Switch Trap)
 *
 * State machine lock: cancellation letters are prohibited until a
 * cryptographically verified POLICY_ISSUED status is confirmed.
 */

export type SwitchStatus =
  | "DRAFT"
  | "SYNOPSIS_COMPLETE"
  | "APPLICATION_SUBMITTED"
  | "UNDERWRITING"
  | "POLICY_ISSUED"
  | "CANCELLATION_ALLOWED"
  | "CANCELLED"
  | "REJECTED_UNDERWRITING";

const TRANSITIONS: Record<SwitchStatus, readonly SwitchStatus[]> = {
  DRAFT: ["SYNOPSIS_COMPLETE", "REJECTED_UNDERWRITING"],
  SYNOPSIS_COMPLETE: ["APPLICATION_SUBMITTED", "DRAFT"],
  APPLICATION_SUBMITTED: ["UNDERWRITING", "REJECTED_UNDERWRITING"],
  UNDERWRITING: ["POLICY_ISSUED", "REJECTED_UNDERWRITING"],
  POLICY_ISSUED: ["CANCELLATION_ALLOWED"],
  CANCELLATION_ALLOWED: ["CANCELLED"],
  CANCELLED: [],
  REJECTED_UNDERWRITING: [],
};

export class IllegalStateTransitionError extends Error {
  constructor(
    public readonly from: SwitchStatus,
    public readonly to: SwitchStatus,
  ) {
    super(`Illegal policy-switch transition: ${from} → ${to}`);
    this.name = "IllegalStateTransitionError";
  }
}

export class CancellationLockedError extends Error {
  constructor(public readonly status: SwitchStatus) {
    super(
      `Cancellation letter blocked until POLICY_ISSUED (current: ${status}). § 63 VVG liability guard.`,
    );
    this.name = "CancellationLockedError";
  }
}

export function assertTransition(from: SwitchStatus, to: SwitchStatus): void {
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}

export function canGenerateCancellationLetter(status: SwitchStatus): boolean {
  return status === "CANCELLATION_ALLOWED" || status === "POLICY_ISSUED";
}

/**
 * Advance to CANCELLATION_ALLOWED only when issued confirmation hash is present.
 */
export function unlockCancellation(params: {
  status: SwitchStatus;
  issuedConfirmationHash: string | null | undefined;
}): SwitchStatus {
  if (params.status !== "POLICY_ISSUED") {
    throw new CancellationLockedError(params.status);
  }
  if (!params.issuedConfirmationHash || params.issuedConfirmationHash.length < 32) {
    throw new Error(
      "POLICY_ISSUED requires cryptographically verified issuedConfirmationHash (≥32 chars)",
    );
  }
  assertTransition("POLICY_ISSUED", "CANCELLATION_ALLOWED");
  return "CANCELLATION_ALLOWED";
}

export function generateCancellationLetterOrThrow(status: SwitchStatus): {
  allowed: true;
  templateKey: "CANCELLATION_LETTER_V1";
} {
  if (!canGenerateCancellationLetter(status)) {
    throw new CancellationLockedError(status);
  }
  // POLICY_ISSUED alone is not enough for letter emission — must be unlocked
  if (status === "POLICY_ISSUED") {
    throw new CancellationLockedError(status);
  }
  return { allowed: true, templateKey: "CANCELLATION_LETTER_V1" };
}
