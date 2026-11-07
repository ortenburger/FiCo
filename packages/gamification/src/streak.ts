/**
 * Weekly streak system — the "Sunday Money Ritual" (GAMIFICATION.md §2).
 *
 * ## Week-bucket choice
 * The product window is Fri 00:00 → Sun 23:59:59.999 local time. Enforcing a
 * concrete ritual window needs a timezone, which this module deliberately does
 * not own. Instead, streak continuity is defined over **ISO week buckets**
 * (Mon 00:00 → Sun 23:59:59.999 in the runtime's local calendar): a check-in
 * belongs to the ISO week of its own date, and two check-ins continue the same
 * streak iff their bucket indices differ by exactly 1.
 *
 * Consequences (accepted, documented):
 * - A Fri–Sun check-in always lands in the ISO bucket of that same week, so the
 *   ritual cadence works unchanged.
 * - A Mon–Thu check-in also counts for that bucket. Window enforcement is the
 *   caller's job — `isSundayRitualWindow()` is exported for the API layer
 *   (Topic 7) to reject early check-ins if it wants to.
 * - Buckets use local calendar parts converted to UTC midnight, so DST shifts
 *   can never create a 23- or 25-hour day artefact.
 *
 * Everything here is pure: `now` is injected, no wall clock, no store. The
 * caller persists the returned `GamificationProfileData` (Topic 1 store) and
 * forwards `award.xpGained` to the engine if it wants XP journaling.
 */
import type { GamificationProfileData } from "./types.js";

/// ── Errors ───────────────────────────────────────────────────────────────

export type StreakErrorCode = "INVALID_DATE" | "CHECK_IN_IN_PAST";

/** Thrown for impossible inputs (invalid date, check-in before last one). */
export class StreakError extends Error {
  readonly code: StreakErrorCode;

  constructor(code: StreakErrorCode, message: string) {
    super(message);
    this.name = "StreakError";
    this.code = code;
  }
}

/// ── Week buckets ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Monotonic ISO-week index of a date. Two dates are in the same week iff the
 * indices are equal; adjacent indices mean consecutive ISO weeks (including
 * across year boundaries, where `year * 100 + week` arithmetic would break).
 *
 * Implementation: move to the Thursday of the date's ISO week (Monday + 3
 * days), which is always a whole number of weeks after the epoch (1970-01-01
 * itself was a Thursday), then divide.
 */
export function isoWeekIndex(date: Date): number {
  assertValidDate(date, "date");
  const midnightUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const isoDay = (new Date(midnightUtc).getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  const thursday = midnightUtc + (3 - isoDay) * MS_PER_DAY;
  return Math.floor(thursday / MS_PER_WEEK);
}

/** Calendar days that fall inside the Fri–Sun ritual window (0 = Sunday). */
const RITUAL_WEEKDAYS = new Set([5, 6, 0]);

/** True for Fri/Sat/Sun in local time — the §2 ritual window. */
export function isSundayRitualWindow(date: Date): boolean {
  assertValidDate(date, "date");
  return RITUAL_WEEKDAYS.has(date.getDay());
}

/// ── Flame tiers (§2) ────────────────────────────────────────────────────

export type FlameTierName = "NONE" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

type ReachedTierName = Exclude<FlameTierName, "NONE">;

type TierStep = {
  tier: ReachedTierName;
  minWeeks: number;
  perk: string;
  /** XP multiplier applied to savings-challenge XP (1 = no bonus). */
  multiplier: number;
};

/** Badge granted the first time the Diamond flame is reached. */
export const DIAMOND_BADGE = "Master of Compounding";

/** Ordered ladder; perks inherit downward (Diamond keeps Silver's multiplier). */
const TIER_LADDER: readonly TierStep[] = [
  { tier: "BRONZE", minWeeks: 4, perk: "Fee Audit Tool", multiplier: 1 },
  { tier: "SILVER", minWeeks: 12, perk: "1.25x XP on Savings Challenges", multiplier: 1.25 },
  { tier: "GOLD", minWeeks: 26, perk: "Free Contract OCR Scan", multiplier: 1.25 },
  { tier: "DIAMOND", minWeeks: 52, perk: DIAMOND_BADGE, multiplier: 1.25 },
];

export type FlameTierResult = {
  tier: FlameTierName;
  nextTier: FlameTierName | null;
  /** Completed weekly check-ins still needed for `nextTier` (0 at Diamond). */
  weeksToNext: number;
  /** Cumulative perks unlocked at this tier. */
  perks: string[];
  /** XP multiplier for savings challenges (1 below Silver). */
  multiplier: number;
};

/** Resolves the flame tier for a number of consecutive streak weeks. */
export function flameTier(weeks: number): FlameTierResult {
  const reached = Number.isFinite(weeks) ? Math.max(0, Math.floor(weeks)) : 0;

  let index = -1;
  for (let i = 0; i < TIER_LADDER.length; i += 1) {
    const step = TIER_LADDER[i];
    if (step && reached >= step.minWeeks) index = i;
  }

  if (index < 0) {
    const first = TIER_LADDER[0]!;
    return {
      tier: "NONE",
      nextTier: first.tier,
      weeksToNext: first.minWeeks - reached,
      perks: [],
      multiplier: 1,
    };
  }

  const current = TIER_LADDER[index]!;
  const next = TIER_LADDER[index + 1];

  return {
    tier: current.tier,
    nextTier: next ? next.tier : null,
    weeksToNext: next ? next.minWeeks - reached : 0,
    perks: TIER_LADDER.slice(0, index + 1).map((step) => step.perk),
    multiplier: current.multiplier,
  };
}

/// ── Streak freezes (earned, never bought — §2) ──────────────────────────

export const FREEZE_SOURCES = ["emergency_fund", "savings_untouched", "snack_quiz"] as const;

/** Responsible behaviours that earn a streak freeze. */
export type FreezeSource = (typeof FREEZE_SOURCES)[number];

/** Banked freezes are capped so a missed month cannot be auto-shielded. */
export const MAX_STREAK_FREEZES = 3;

export function isFreezeSource(value: unknown): value is FreezeSource {
  return typeof value === "string" && (FREEZE_SOURCES as readonly string[]).includes(value);
}

export type FreezeRefusalReason = "UNKNOWN_SOURCE" | "CAP_REACHED";

export type FreezeGrant = {
  profile: GamificationProfileData;
  granted: boolean;
  /** Set when `granted` is false. */
  reason?: FreezeRefusalReason;
  source: string;
};

/**
 * Banks one earned freeze. Unknown sources are refused (they are not
 * responsible-behaviour evidence), and known sources stop adding once
 * `MAX_STREAK_FREEZES` is reached. Never mutates the input profile.
 */
export function registerEarnedFreeze(
  profile: GamificationProfileData,
  source: string,
): FreezeGrant {
  if (!isFreezeSource(source)) {
    return { profile: cloneProfile(profile), granted: false, reason: "UNKNOWN_SOURCE", source };
  }
  if (profile.streakFreezeCount >= MAX_STREAK_FREEZES) {
    return { profile: cloneProfile(profile), granted: false, reason: "CAP_REACHED", source };
  }
  return {
    profile: {
      ...cloneProfile(profile),
      streakFreezeCount: Math.max(0, profile.streakFreezeCount) + 1,
    },
    granted: true,
    source,
  };
}

/// ── Weekly check-in ─────────────────────────────────────────────────────

/** XP granted for one Sunday Money Ritual claim (§3 recap: "+150 XP"). */
export const CHECK_IN_XP = 150;

export type CheckInAward = {
  xpGained: number;
  /** True only when the streak advanced (not for same-week replays). */
  streakBumped: boolean;
  /** True when a gap was bridged by consuming one banked freeze. */
  freezeUsed: boolean;
  /** True when a gap with no freeze available restarted the streak at 1. */
  streakReset: boolean;
  badgesEarned: string[];
};

export type CheckInResult = {
  profile: GamificationProfileData;
  award: CheckInAward;
  tier: FlameTierResult;
};

/**
 * Applies one weekly check-in at `now`.
 *
 * - no previous check-in            → streak = 1
 * - same ISO week bucket            → no-op: 0 XP, streak unchanged (idempotent)
 * - directly consecutive bucket     → streak + 1
 * - gap > 1 bucket, freeze banked   → consume ONE freeze, streak + 1
 * - gap > 1 bucket, no freeze       → streak = 1
 *
 * One freeze bridges any gap length (a single absence), and the freeze counter
 * never drops below 0. `longestStreakWeeks` is kept in sync, and the Diamond
 * badge is granted once when the 52-week flame is first reached.
 */
export function checkIn(profile: GamificationProfileData, now: Date): CheckInResult {
  assertValidDate(now, "now");
  const previous = profile.lastCheckInDate;

  // First check-in ever: start the flame.
  if (previous === null) {
    const next = withStreak(profile, 1, now);
    return {
      profile: next,
      award: {
        xpGained: CHECK_IN_XP,
        streakBumped: true,
        freezeUsed: false,
        streakReset: false,
        badgesEarned: grantDiamondBadge(profile, next),
      },
      tier: flameTier(1),
    };
  }

  assertValidDate(previous, "profile.lastCheckInDate");
  const gap = isoWeekIndex(now) - isoWeekIndex(previous);

  if (gap < 0) {
    throw new StreakError(
      "CHECK_IN_IN_PAST",
      `check-in date ${now.toISOString()} precedes last check-in ${previous.toISOString()}`,
    );
  }

  // Same ISO week: idempotent replay — nothing changes, no XP.
  if (gap === 0) {
    return {
      profile: cloneProfile(profile),
      award: {
        xpGained: 0,
        streakBumped: false,
        freezeUsed: false,
        streakReset: false,
        badgesEarned: [],
      },
      tier: flameTier(profile.currentStreakWeeks),
    };
  }

  // Consecutive week: plain continuation.
  if (gap === 1) {
    const next = withStreak(profile, profile.currentStreakWeeks + 1, now);
    return {
      profile: next,
      award: {
        xpGained: CHECK_IN_XP,
        streakBumped: true,
        freezeUsed: false,
        streakReset: false,
        badgesEarned: grantDiamondBadge(profile, next),
      },
      tier: flameTier(next.currentStreakWeeks),
    };
  }

  // Missed at least one week: a banked freeze rescues the flame.
  const freezes = Math.max(0, profile.streakFreezeCount);
  if (freezes > 0) {
    const next = withStreak(
      { ...profile, streakFreezeCount: freezes - 1 },
      profile.currentStreakWeeks + 1,
      now,
    );
    return {
      profile: next,
      award: {
        xpGained: CHECK_IN_XP,
        streakBumped: true,
        freezeUsed: true,
        streakReset: false,
        badgesEarned: grantDiamondBadge(profile, next),
      },
      tier: flameTier(next.currentStreakWeeks),
    };
  }

  // No freeze: the streak restarts, this check-in is week 1.
  const next = withStreak(profile, 1, now);
  return {
    profile: next,
    award: {
      xpGained: CHECK_IN_XP,
      streakBumped: true,
      freezeUsed: false,
      streakReset: true,
      badgesEarned: grantDiamondBadge(profile, next),
    },
    tier: flameTier(1),
  };
}

/// ── Snapshot for the Weekly Wrapped job (Topic 5) ────────────────────────

/** Structural mirror of Topic 5's `StreakSnapshotPortInput` (weekly-story.ts). */
export type StreakSnapshotPortInput = {
  weeks: number;
  xpGainedThisWeek: number;
};

export type StreakSnapshot = StreakSnapshotPortInput & {
  flameTier: FlameTierResult;
  freezes: number;
};

/**
 * Read-only projection for the Weekly Money Wrapped generator. `xpGainedThisWeek`
 * defaults to one check-in claim when a check-in exists, else 0 — the caller can
 * pass the real journaled sum when it has one.
 */
export function streakSnapshot(
  profile: GamificationProfileData,
  xpGainedThisWeek: number = profile.lastCheckInDate ? CHECK_IN_XP : 0,
): StreakSnapshot {
  return {
    weeks: Math.max(0, profile.currentStreakWeeks),
    xpGainedThisWeek: Math.max(0, Math.trunc(xpGainedThisWeek)),
    flameTier: flameTier(profile.currentStreakWeeks),
    freezes: Math.max(0, profile.streakFreezeCount),
  };
}

/// ── Internals ───────────────────────────────────────────────────────────

function withStreak(
  profile: GamificationProfileData,
  weeks: number,
  now: Date,
): GamificationProfileData {
  return {
    ...cloneProfile(profile),
    currentStreakWeeks: weeks,
    longestStreakWeeks: Math.max(profile.longestStreakWeeks, weeks),
    lastCheckInDate: new Date(now.getTime()),
  };
}

/** Grants the §2 Diamond badge exactly once; returns the newly earned ids. */
function grantDiamondBadge(
  before: GamificationProfileData,
  after: GamificationProfileData,
): string[] {
  if (after.currentStreakWeeks < 52 || before.badges.includes(DIAMOND_BADGE)) return [];
  after.badges = [...after.badges, DIAMOND_BADGE];
  return [DIAMOND_BADGE];
}

function cloneProfile(profile: GamificationProfileData): GamificationProfileData {
  return {
    ...profile,
    lastCheckInDate: profile.lastCheckInDate ? new Date(profile.lastCheckInDate.getTime()) : null,
    completedSnacks: [...profile.completedSnacks],
    badges: [...profile.badges],
  };
}

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new StreakError("INVALID_DATE", `${label} must be a valid Date`);
  }
}
