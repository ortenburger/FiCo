/**
 * Tests for the demo seed (Topic 10) — fully offline: the client under test is
 * an in-memory fake that records writes, so no Prisma client is constructed
 * and no DB connection is opened (the whole point of the passed-client design).
 */
import { describe, expect, it } from "vitest";

import {
  applyDemoSeed,
  buildDemoSeedPayload,
  DEMO_USER_ID,
  type DemoSeedClient,
  type DemoSeedPayload,
} from "./demo-seed.js";

/** Minimal recording client — same call shape as the structural client type. */
function createFakeClient(): { client: DemoSeedClient; calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const record = (table: string, args: Record<string, unknown>) => {
    calls.push([table, structuredClone(args)]);
    return Promise.resolve({});
  };
  return {
    calls,
    client: {
      user: { upsert: (args) => record("user.upsert", args as unknown as Record<string, unknown>) },
      userGamificationProfile: {
        upsert: (args) => record("userGamificationProfile.upsert", args as unknown as Record<string, unknown>),
      },
      financialSnack: {
        upsert: (args) => record("financialSnack.upsert", args as unknown as Record<string, unknown>),
      },
      gamificationAward: {
        create: (args) => record("gamificationAward.create", args as unknown as Record<string, unknown>),
      },
    },
  };
}

const FIXED_NOW = new Date("2026-11-06T18:30:00.000Z"); // Friday

describe("buildDemoSeedPayload", () => {
  const payload: DemoSeedPayload = buildDemoSeedPayload(FIXED_NOW);

  it("targets the demo user profile (Egon Demo) with a fresh-but-lived-in state", () => {
    expect(payload.displayName).toBe("Egon Demo");
    expect(payload.user.id).toBe(DEMO_USER_ID);
    expect(payload.user.email).toBe("demo@fico.local");
    expect(payload.user.subscriptionTier).toBe("FREE");

    // The gamification profile itself is in the payload, keyed to the same user.
    expect(payload.profile).toMatchObject({
      userId: DEMO_USER_ID,
      currentStreakWeeks: 2,
      totalXp: 200,
      currentLevel: 1,
      completedSnacks: [],
    });
    // Check-in date is deterministic from the injected now (Monday of the week).
    expect(payload.profile.lastCheckInDate?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    // §2: one earned freeze, never bought.
    expect(payload.profile.streakFreezeCount).toBe(1);
  });

  it("includes exactly one FinancialSnack with a playable quiz", () => {
    expect(payload.snack.slug).toBe("ter-fee-drag");
    expect(payload.snack.category).toBe("INVESTING");
    expect(payload.snack.quiz.options.filter((option) => option.correct)).toHaveLength(1);
    expect(payload.snack.content.xpReward).toBe(25); // §5: correct = +25 XP
  });

  it("includes one quest completion pair (quest + journal award)", () => {
    expect(payload.questCompletion.questId).toBe("quest-1.1-connect-bank");
    expect(payload.questCompletion.award.eventType).toBe("QUEST_COMPLETED");
    expect(payload.questCompletion.award.xpAwarded).toBe(50); // §6 Quest 1.1
    // Pair invariant: profile XP = check-in (150) + quest award (50).
    expect(payload.profile.totalXp).toBe(150 + payload.questCompletion.award.xpAwarded);
    // eventId must be set so engine replay of the award is idempotent.
    expect(payload.questCompletion.award.eventId).toBe("demo-quest-1.1-connect-bank");
  });

  it("is deterministic for the same `now`", () => {
    expect(buildDemoSeedPayload(FIXED_NOW)).toEqual(payload);
  });
});

describe("applyDemoSeed", () => {
  it("writes user, profile, snack and quest award through the PASSED client only", async () => {
    const { client, calls } = createFakeClient();
    const payload = buildDemoSeedPayload(FIXED_NOW);

    await applyDemoSeed(client, payload);

    expect(calls.map(([table]) => table)).toEqual([
      "user.upsert",
      "userGamificationProfile.upsert",
      "financialSnack.upsert",
      "gamificationAward.create",
    ]);

    const [userCall, profileCall, snackCall, awardCall] = calls;
    expect(userCall?.[1]).toMatchObject({ where: { id: DEMO_USER_ID }, update: {} });
    expect(profileCall?.[1]).toMatchObject({ where: { userId: DEMO_USER_ID } });
    expect(snackCall?.[1]).toMatchObject({ where: { slug: "ter-fee-drag" } });
    expect(awardCall?.[1]).toMatchObject({
      data: {
        userId: DEMO_USER_ID,
        eventId: "demo-quest-1.1-connect-bank",
        eventType: "QUEST_COMPLETED",
        xpAwarded: 50,
      },
    });
  });

  it("is idempotent against a repeated run (upserts + same eventId)", async () => {
    const { client, calls } = createFakeClient();
    const payload = buildDemoSeedPayload(FIXED_NOW);

    await applyDemoSeed(client, payload);
    await applyDemoSeed(client, payload);

    const userUpserts = calls.filter(([table]) => table === "user.upsert");
    expect(userUpserts).toHaveLength(2);
    expect(userUpserts[1]?.[1]).toEqual(userUpserts[0]?.[1]);
  });
});
