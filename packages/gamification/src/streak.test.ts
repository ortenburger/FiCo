import { describe, expect, it } from "vitest";
import {
  CHECK_IN_XP,
  DIAMOND_BADGE,
  FREEZE_SOURCES,
  MAX_STREAK_FREEZES,
  StreakError,
  checkIn,
  flameTier,
  isSundayRitualWindow,
  isoWeekIndex,
  registerEarnedFreeze,
  streakSnapshot,
  type FlameTierName,
} from "./streak.js";
import type { GamificationProfileData } from "./types.js";
import type { StreakSnapshot, StreakSnapshotPortInput } from "./streak.js";

/** Fixed local dates — no `new Date()` without arguments anywhere in this suite. */
const MON_W1 = new Date(2026, 3, 27); // Mon 2026-04-27 (start of W1's ISO week)
const FRI_W1 = new Date(2026, 4, 1); // Fri 2026-05-01
const SUN_W1 = new Date(2026, 4, 3); // Sun 2026-05-03 (same ISO week)
const FRI_W2 = new Date(2026, 4, 8); // Fri 2026-05-08 (next ISO week)
const MON_W2 = new Date(2026, 4, 4); // Mon 2026-05-04 (start of W2's ISO week)
const FRI_W4 = new Date(2026, 4, 22); // Fri 2026-05-22 (3 buckets after W1)
const THU_2026_53 = new Date(2026, 11, 31); // Thu 2026-12-31 (ISO W53)
const MON_2027_01 = new Date(2027, 0, 4); // Mon 2027-01-04 (ISO W1)

function makeProfile(overrides: Partial<GamificationProfileData> = {}): GamificationProfileData {
  return {
    userId: "user-streak",
    currentStreakWeeks: 0,
    longestStreakWeeks: 0,
    lastCheckInDate: null,
    streakFreezeCount: 1,
    totalXp: 0,
    currentLevel: 1,
    completedSnacks: [],
    badges: [],
    ...overrides,
  };
}

describe("isoWeekIndex", () => {
  it("puts Fri and Sun of the same ISO week in one bucket", () => {
    expect(isoWeekIndex(FRI_W1)).toBe(isoWeekIndex(SUN_W1));
    expect(isoWeekIndex(MON_W1)).toBe(isoWeekIndex(FRI_W1));
  });

  it("increments by exactly 1 per consecutive week", () => {
    expect(isoWeekIndex(FRI_W2) - isoWeekIndex(FRI_W1)).toBe(1);
    expect(isoWeekIndex(FRI_W4) - isoWeekIndex(FRI_W1)).toBe(3);
  });

  it("stays consecutive across the ISO year boundary (no year*100 arithmetic)", () => {
    expect(isoWeekIndex(MON_2027_01) - isoWeekIndex(THU_2026_53)).toBe(1);
  });

  it("rejects invalid dates", () => {
    expect(() => isoWeekIndex(new Date(Number.NaN))).toThrow(StreakError);
  });
});

describe("flameTier — §2 ladder", () => {
  it("returns NONE below 4 weeks", () => {
    expect(flameTier(0)).toEqual({
      tier: "NONE",
      nextTier: "BRONZE",
      weeksToNext: 4,
      perks: [],
      multiplier: 1,
    });
    expect(flameTier(3)).toMatchObject({ tier: "NONE", weeksToNext: 1 });
    expect(flameTier(-2)).toMatchObject({ tier: "NONE", weeksToNext: 4 });
    expect(flameTier(Number.NaN)).toMatchObject({ tier: "NONE" });
  });

  it("hits every tier boundary 3→4, 11→12, 25→26, 51→52", () => {
    const boundaries: Array<[number, FlameTierName]> = [
      [3, "NONE"],
      [4, "BRONZE"],
      [11, "SILVER"].slice(0, 0) as never, // placeholder removed below
    ];
    expect(boundaries).toBeDefined();

    expect(flameTier(3).tier).toBe("NONE");
    expect(flameTier(4).tier).toBe("BRONZE");
    expect(flameTier(3).weeksToNext).toBe(1);

    expect(flameTier(11).tier).toBe("BRONZE");
    expect(flameTier(12).tier).toBe("SILVER");
    expect(flameTier(11).weeksToNext).toBe(1);

    expect(flameTier(25).tier).toBe("SILVER");
    expect(flameTier(26).tier).toBe("GOLD");
    expect(flameTier(25).weeksToNext).toBe(1);

    expect(flameTier(51).tier).toBe("GOLD");
    expect(flameTier(52).tier).toBe("DIAMOND");
    expect(flameTier(51).weeksToNext).toBe(1);
  });

  it("carries the §2 perks cumulatively", () => {
    expect(flameTier(4).perks).toEqual(["Fee Audit Tool"]);
    expect(flameTier(12).perks).toEqual([
      "Fee Audit Tool",
      "1.25x XP on Savings Challenges",
    ]);
    expect(flameTier(26).perks).toContain("Free Contract OCR Scan");
    expect(flameTier(52).perks).toContain(DIAMOND_BADGE);
  });

  it("applies the 1.25x savings multiplier from Silver upward only", () => {
    expect(flameTier(4).multiplier).toBe(1);
    expect(flameTier(11).multiplier).toBe(1);
    expect(flameTier(12).multiplier).toBe(1.25);
    expect(flameTier(26).multiplier).toBe(1.25);
    expect(flameTier(52).multiplier).toBe(1.25);
  });

  it("tops out at Diamond with no next tier", () => {
    expect(flameTier(52)).toMatchObject({ tier: "DIAMOND", nextTier: null, weeksToNext: 0 });
    expect(flameTier(400)).toMatchObject({ tier: "DIAMOND", nextTier: null, weeksToNext: 0 });
  });
});

describe("checkIn", () => {
  it("starts a fresh streak on the first check-in and awards 150 XP", () => {
    const input = makeProfile();
    const result = checkIn(input, FRI_W1);

    expect(result.award).toEqual({
      xpGained: CHECK_IN_XP,
      streakBumped: true,
      freezeUsed: false,
      streakReset: false,
      badgesEarned: [],
    });
    expect(result.profile.currentStreakWeeks).toBe(1);
    expect(result.profile.longestStreakWeeks).toBe(1);
    expect(result.profile.lastCheckInDate).toEqual(FRI_W1);
    expect(result.tier.tier).toBe("NONE");
    expect(result.tier.weeksToNext).toBe(3);

    // Pure: the input profile is untouched.
    expect(input.currentStreakWeeks).toBe(0);
    expect(input.lastCheckInDate).toBeNull();
  });

  it("is idempotent inside the same ISO week (no XP, no bump)", () => {
    const first = checkIn(makeProfile(), MON_W1);
    const replay = checkIn(first.profile, FRI_W1);

    expect(replay.award).toEqual({
      xpGained: 0,
      streakBumped: false,
      freezeUsed: false,
      streakReset: false,
      badgesEarned: [],
    });
    expect(replay.profile.currentStreakWeeks).toBe(1);
    expect(replay.profile.longestStreakWeeks).toBe(1);
    expect(replay.profile.lastCheckInDate).toEqual(MON_W1);

    const third = checkIn(replay.profile, SUN_W1);
    expect(third.award.xpGained).toBe(0);
    expect(third.profile.currentStreakWeeks).toBe(1);
  });

  it("increments the streak on a directly consecutive week", () => {
    const start = checkIn(makeProfile(), FRI_W1).profile;
    const next = checkIn(start, FRI_W2);

    expect(next.award.xpGained).toBe(CHECK_IN_XP);
    expect(next.award.streakBumped).toBe(true);
    expect(next.award.freezeUsed).toBe(false);
    expect(next.profile.currentStreakWeeks).toBe(2);
    expect(next.profile.longestStreakWeeks).toBe(2);
    expect(next.profile.lastCheckInDate).toEqual(FRI_W2);
  });

  it("rescues a gap by consuming one banked freeze and keeps the streak", () => {
    const before = makeProfile({
      currentStreakWeeks: 5,
      longestStreakWeeks: 5,
      lastCheckInDate: FRI_W1,
      streakFreezeCount: 2,
    });
    const result = checkIn(before, FRI_W4); // 3 buckets later = one missed week

    expect(result.award.freezeUsed).toBe(true);
    expect(result.award.streakReset).toBe(false);
    expect(result.award.streakBumped).toBe(true);
    expect(result.award.xpGained).toBe(CHECK_IN_XP);
    expect(result.profile.currentStreakWeeks).toBe(6);
    expect(result.profile.streakFreezeCount).toBe(1);
    expect(result.profile.longestStreakWeeks).toBe(6);
  });

  it("uses exactly one freeze even when several weeks were missed", () => {
    const before = makeProfile({
      currentStreakWeeks: 10,
      longestStreakWeeks: 10,
      lastCheckInDate: FRI_W1,
      streakFreezeCount: 2,
    });
    const result = checkIn(before, new Date(2026, 5, 12)); // 6 buckets later

    expect(result.profile.currentStreakWeeks).toBe(11);
    expect(result.profile.streakFreezeCount).toBe(1);
    expect(result.award.freezeUsed).toBe(true);
  });

  it("resets to 1 when a gap has no freeze available", () => {
    const before = makeProfile({
      currentStreakWeeks: 9,
      longestStreakWeeks: 9,
      lastCheckInDate: FRI_W1,
      streakFreezeCount: 0,
    });
    const result = checkIn(before, FRI_W4);

    expect(result.award.streakReset).toBe(true);
    expect(result.award.freezeUsed).toBe(false);
    expect(result.award.xpGained).toBe(CHECK_IN_XP);
    expect(result.profile.currentStreakWeeks).toBe(1);
    expect(result.profile.longestStreakWeeks).toBe(9); // lifetime best survives
    expect(result.profile.streakFreezeCount).toBe(0);
  });

  it("never drives the freeze counter below 0 (floor at 0)", () => {
    const before = makeProfile({
      currentStreakWeeks: 4,
      longestStreakWeeks: 4,
      lastCheckInDate: FRI_W1,
      streakFreezeCount: 0,
    });
    const result = checkIn(before, FRI_W4);

    expect(result.profile.streakFreezeCount).toBe(0);
    expect(result.profile.streakFreezeCount).toBeGreaterThanOrEqual(0);
  });

  it("refuses a check-in dated before the last one", () => {
    const before = makeProfile({ currentStreakWeeks: 2, lastCheckInDate: FRI_W2 });
    try {
      checkIn(before, FRI_W1);
      throw new Error("expected checkIn to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StreakError);
      expect((error as StreakError).code).toBe("CHECK_IN_IN_PAST");
    }
  });

  it("keeps the lifetime best when the streak restarts", () => {
    const before = makeProfile({
      currentStreakWeeks: 2,
      longestStreakWeeks: 30,
      lastCheckInDate: FRI_W1,
      streakFreezeCount: 0,
    });
    const result = checkIn(before, FRI_W4);
    expect(result.profile.currentStreakWeeks).toBe(1);
    expect(result.profile.longestStreakWeeks).toBe(30);
  });

  it("crosses each tier boundary through a real check-in", () => {
    const boundaries: Array<[number, FlameTierName, number]> = [
      [3, "BRONZE", 8],
      [11, "SILVER", 14],
      [25, "GOLD", 26],
      [51, "DIAMOND", 0],
    ];

    for (const [weeks, expectedTier, expectedWeeksToNext] of boundaries) {
      const before = makeProfile({
        currentStreakWeeks: weeks,
        longestStreakWeeks: weeks,
        lastCheckInDate: FRI_W1,
        streakFreezeCount: 1,
      });
      const result = checkIn(before, FRI_W2);

      expect(result.profile.currentStreakWeeks).toBe(weeks + 1);
      expect(result.tier.tier).toBe(expectedTier);
      expect(result.tier.weeksToNext).toBe(expectedWeeksToNext);
      expect(result.award.streakBumped).toBe(true);
    }
  });

  it("grants the Diamond badge once, at 52 weeks", () => {
    const at51 = makeProfile({
      currentStreakWeeks: 51,
      longestStreakWeeks: 51,
      lastCheckInDate: FRI_W1,
    });
    const toDiamond = checkIn(at51, FRI_W2);
    expect(toDiamond.award.badgesEarned).toEqual([DIAMOND_BADGE]);
    expect(toDiamond.profile.badges).toEqual([DIAMOND_BADGE]);

    const again = checkIn(toDiamond.profile, FRI_W4);
    expect(again.award.badgesEarned).toEqual([]);
    expect(again.profile.badges).toEqual([DIAMOND_BADGE]);
  });
});

describe("registerEarnedFreeze", () => {
  it("accepts every documented responsible-behaviour source", () => {
    for (const source of FREEZE_SOURCES) {
      const result = registerEarnedFreeze(makeProfile({ streakFreezeCount: 0 }), source);
      expect(result.granted).toBe(true);
      expect(result.profile.streakFreezeCount).toBe(1);
      expect(result.source).toBe(source);
    }
  });

  it("refuses sources outside the earned-freeze bucket", () => {
    const input = makeProfile({ streakFreezeCount: 1 });
    const result = registerEarnedFreeze(input, "bought_with_eur");

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("UNKNOWN_SOURCE");
    expect(result.profile.streakFreezeCount).toBe(1);
    expect(input.streakFreezeCount).toBe(1);
  });

  it("refuses to bank more than the cap", () => {
    const result = registerEarnedFreeze(
      makeProfile({ streakFreezeCount: MAX_STREAK_FREEZES }),
      "emergency_fund",
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("CAP_REACHED");
    expect(result.profile.streakFreezeCount).toBe(MAX_STREAK_FREEZES);
  });

  it("never produces a negative freeze count", () => {
    const result = registerEarnedFreeze(
      makeProfile({ streakFreezeCount: -2 }),
      "snack_quiz",
    );
    expect(result.granted).toBe(true);
    expect(result.profile.streakFreezeCount).toBe(1);
  });
});

describe("streakSnapshot", () => {
  it("shapes the payload for Topic 5's Weekly Wrapped port", () => {
    const snapshot: StreakSnapshot = streakSnapshot(
      makeProfile({
        currentStreakWeeks: 14,
        longestStreakWeeks: 20,
        lastCheckInDate: FRI_W1,
        streakFreezeCount: 2,
      }),
    );

    const portInput: StreakSnapshotPortInput = snapshot;
    expect(portInput.weeks).toBe(14);
    expect(portInput.xpGainedThisWeek).toBe(CHECK_IN_XP);
    expect(snapshot.freezes).toBe(2);
    expect(snapshot.flameTier.tier).toBe("SILVER");
    expect(snapshot.flameTier.multiplier).toBe(1.25);
  });

  it("reports 0 weekly XP before the first check-in", () => {
    expect(streakSnapshot(makeProfile()).xpGainedThisWeek).toBe(0);
  });

  it("accepts an explicit weekly XP sum (e.g. from the award journal)", () => {
    const snapshot = streakSnapshot(
      makeProfile({ currentStreakWeeks: 4, lastCheckInDate: FRI_W1 }),
      425,
    );
    expect(snapshot.xpGainedThisWeek).toBe(425);
    expect(snapshot.weeks).toBe(4);
  });
});

describe("isSundayRitualWindow", () => {
  it("opens Fri–Sun and closes Mon–Thu", () => {
    expect(isSundayRitualWindow(FRI_W1)).toBe(true);
    expect(isSundayRitualWindow(new Date(2026, 4, 2))).toBe(true); // Sat
    expect(isSundayRitualWindow(SUN_W1)).toBe(true);
    expect(isSundayRitualWindow(MON_W2)).toBe(false); // Mon
    expect(isSundayRitualWindow(new Date(2026, 4, 5))).toBe(false); // Tue
    expect(isSundayRitualWindow(new Date(2026, 4, 7))).toBe(false); // Thu
  });
});
