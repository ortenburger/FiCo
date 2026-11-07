import { describe, expect, it } from "vitest";
import { GamificationEngine } from "./engine.js";
import { LEVEL_TITLES, MAX_LEVEL, levelForXp, levelTitle, xpForLevel } from "./levels.js";
import { InMemoryStore } from "./adapters/memory.js";
import type { BadgeRule, FicoEvent, GamificationProfileData } from "./types.js";

function makeEngine(config?: {
  eventXp?: Record<string, number>;
  defaultXp?: number;
  badgeRules?: BadgeRule[];
}) {
  const store = new InMemoryStore();
  const engine = new GamificationEngine(store, config);
  return { store, engine };
}

describe("levels", () => {
  it("maps the seven Duolingo-style titles in order", () => {
    expect(LEVEL_TITLES).toHaveLength(7);
    expect(levelTitle(1)).toBe("Budget Novice");
    expect(levelTitle(7)).toBe("Financial Sovereign");
  });

  it("keeps XP floors monotonically increasing", () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
    }
  });

  it("reaches Lv 1 with zero XP and clamps out-of-range levels", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
    expect(xpForLevel(99)).toBe(xpForLevel(MAX_LEVEL));
    expect(levelForXp(0)).toBe(1);
  });

  it("returns the highest level whose floor is met", () => {
    const lv2 = xpForLevel(2);
    expect(levelForXp(lv2)).toBe(2);
    expect(levelForXp(lv2 - 1)).toBe(1);
    expect(levelForXp(10_000_000)).toBe(MAX_LEVEL);
  });
});

describe("GamificationEngine", () => {
  const { store, engine } = makeEngine();

  it("awards XP per event type and creates the profile lazily", async () => {
    const result = await engine.emit("user-1", { type: "CHECK_IN" });
    expect(result.xpGained).toBe(150);
    expect(result.levelUp).toBeUndefined();
    expect(result.badgesEarned).toEqual([]);

    const profile = await engine.getProfile("user-1");
    expect(profile).toMatchObject({
      userId: "user-1",
      totalXp: 150,
      currentLevel: 1,
      levelTitle: "Budget Novice",
      streakFreezeCount: 1,
    });
    expect(profile?.lastCheckInDate).toBeNull();
  });

  it("lets meta.xp override the configured table (quest XP)", async () => {
    const result = await engine.emit("q-user", { type: "QUEST_COMPLETE", meta: { xp: 500 } });
    expect(result.xpGained).toBe(500);
  });

  it("honours negative XP and never lets the balance drop below 0", async () => {
    await engine.emit("neg-user", { type: "SNACK_CORRECT" }); // +25
    await engine.emit("neg-user", { type: "SNACK_WRONG" }); // -5
    expect((await engine.getProfile("neg-user"))?.totalXp).toBe(20);

    const drained = await engine.emit("neg-user", { type: "SNACK_WRONG", meta: { xp: -100 } });
    expect(drained.xpGained).toBe(-100);
    expect((await engine.getProfile("neg-user"))?.totalXp).toBe(0);
  });

  it("levels up when the XP floor is crossed and keeps progression monotonic", async () => {
    const { store: s, engine: e } = makeEngine();
    const floorOfLv2 = xpForLevel(2);
    await e.emit("ladder", { type: "CHECK_IN", meta: { xp: floorOfLv2 } });

    const profile = await e.getProfile("ladder");
    expect(profile?.currentLevel).toBe(2);
    expect(profile?.totalXp).toBe(300);

    // A wrong snack answer (-5) must not demote the level.
    await e.emit("ladder", { type: "SNACK_WRONG" });
    expect((await e.getProfile("ladder"))?.currentLevel).toBe(2);
    expect(s.profiles.get("ladder")?.longestStreakWeeks).toBe(0);
  });

  it("returns a levelUp payload with title on crossing a floor", async () => {
    const { engine: e } = makeEngine();
    const result = await e.emit("lv", { type: "CHECK_IN", meta: { xp: xpForLevel(2) } });
    expect(result.levelUp).toEqual({ level: 2, title: "Shield Bearer" });
  });

  it("dedupes replayed events by eventId (idempotent emit)", async () => {
    const event = { type: "CHECK_IN", eventId: "evt-001" } as const;
    const first = await engine.emit("idem", event);
    const replay = await engine.emit("idem", event);

    expect(first.xpGained).toBe(150);
    expect(replay).toEqual({ xpGained: 0, badgesEarned: [] });
    expect((await engine.getProfile("idem"))?.totalXp).toBe(150);
    expect(store.awards.filter((entry) => entry.userId === "idem")).toHaveLength(1);
  });

  it("does not dedupe across different users or without eventId", async () => {
    await engine.emit("a-user", { type: "CHECK_IN", eventId: "shared-evt" });
    await engine.emit("b-user", { type: "CHECK_IN", eventId: "shared-evt" });
    expect((await engine.getProfile("a-user"))?.totalXp).toBe(150);
    expect((await engine.getProfile("b-user"))?.totalXp).toBe(150);

    await engine.emit("c-user", { type: "SNACK_CORRECT" });
    const again = await engine.emit("c-user", { type: "SNACK_CORRECT" });
    expect(again.xpGained).toBe(25);
    expect((await engine.getProfile("c-user"))?.totalXp).toBe(50);
  });

  it("grants badge rules once and unknown event types fall back to default XP", async () => {
    const { store: s, engine: e } = makeEngine({
      defaultXp: 10,
      badgeRules: [
        { badge: "First Flare", when: (ev) => ev.type === "CHECK_IN" },
        {
          badge: "Shield Bearer Badge",
          when: (_ev: FicoEvent, profile: GamificationProfileData) => profile.currentStreakWeeks >= 4,
        },
      ],
    });

    const first = await e.emit("badges", { type: "MYSTERY_EVENT" });
    expect(first.xpGained).toBe(10);
    expect(first.badgesEarned).toEqual([]);

    await s.saveProfile("badges", {
      ...(await s.loadProfile("badges"))!,
      currentStreakWeeks: 4,
    });

    const second = await e.emit("badges", { type: "CHECK_IN" });
    expect(second.xpGained).toBe(150);
    expect(second.badgesEarned).toEqual(["First Flare", "Shield Bearer Badge"]);

    const third = await e.emit("badges", { type: "CHECK_IN" });
    expect(third.badgesEarned).toEqual([]);
    expect((await e.getProfile("badges"))?.badges).toEqual([
      "First Flare",
      "Shield Bearer Badge",
    ]);
  });

  it("getProfile returns null for users never seen", async () => {
    expect(await engine.getProfile("ghost")).toBeNull();
  });

  it("supports custom config (config wins over defaults)", async () => {
    const { engine: e } = makeEngine({ eventXp: { DAILY_REFLECT: 7 }, defaultXp: 2 });
    expect((await e.emit("cfg", { type: "DAILY_REFLECT" })).xpGained).toBe(7);
    expect((await e.emit("cfg", { type: "UNKNOWN" })).xpGained).toBe(2);
  });
});
