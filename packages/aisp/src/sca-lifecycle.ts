/**
 * Failure Mode 3 — 90/180-Day SCA Wall
 *
 * Grace-period flagging when consent/SCA data goes stale.
 */

export type ScaHealth =
  | { status: "HEALTHY"; scaValidUntil: Date }
  | {
      status: "WARNING_STALE_TX";
      scaValidUntil: Date;
      lastBookingAgeDays: number;
    }
  | {
      status: "EXPIRED";
      scaValidUntil: Date;
      autoModeDisabled: true;
    };

export const STALE_TX_WARNING_DAYS = 7;

export function evaluateScaHealth(params: {
  scaValidUntil: Date;
  lastBookingDate: Date | null;
  now?: Date;
}): ScaHealth {
  const now = params.now ?? new Date();

  if (params.scaValidUntil.getTime() <= now.getTime()) {
    return {
      status: "EXPIRED",
      scaValidUntil: params.scaValidUntil,
      autoModeDisabled: true,
    };
  }

  if (params.lastBookingDate) {
    const ageDays = Math.floor(
      (now.getTime() - params.lastBookingDate.getTime()) / 86_400_000,
    );
    if (ageDays > STALE_TX_WARNING_DAYS) {
      return {
        status: "WARNING_STALE_TX",
        scaValidUntil: params.scaValidUntil,
        lastBookingAgeDays: ageDays,
      };
    }
  }

  return { status: "HEALTHY", scaValidUntil: params.scaValidUntil };
}
