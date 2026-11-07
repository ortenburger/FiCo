import { describe, expect, it } from "vitest";
import { InMemoryStore } from "./adapters/memory.js";
import type { GamificationProfileData } from "./types.js";

function profileData(userId: string): GamificationProfileData {
  return {
    userId,
    currentStreakWeeks: 3,
    longestStreakWeeks: 5,
    lastCheckInDate: new Date("2026-11-01T18:00:00.000Z"),
    streakFreezeCount: 2,
    totalXp: 420,
    currentLevel: 1,
    completedSnacks: ["etf-rebalancing"],
    badges: ["First Flare"],
  };
}

describe("InMemoryStore", () => {
  const store = new InMemoryStore();

  it("round-trips profile state and never leaks internal references", async () => {
    const saved = await store.saveProfile("u1", profileData("u1"));
    expect(saved.badges).toEqual(["First Flare"]);

    const loaded = await store.loadProfile("u1");
    expect(loaded).toEqual(saved);
    expect(loaded).not.toBe(await store.loadProfile("u1"));
    expect(await store.loadProfile("nope")).toBeNull();
  });

  it("journals awards and detects eventId duplicates per user", async () => {
    await store.recordAward({
      userId: "u2",
      eventId: "evt-a",
      eventType: "CHECK_IN",
      xpAwarded: 150,
      createdAt: new Date("2026-11-01T18:00:00.000Z"),
    });
    await store.recordAward({
      userId: "u3",
      eventId: "evt-a",
      eventType: "CHECK_IN",
      xpAwarded: 150,
      createdAt: new Date("2026-11-01T18:00:00.000Z"),
    });

    expect(await store.hasAward("u2", "evt-a")).toBe(true);
    expect(await store.hasAward("u3", "evt-a")).toBe(true);
    expect(await store.hasAward("u2", "evt-b")).toBe(false);
    expect(store.awards).toHaveLength(2);
  });
});
