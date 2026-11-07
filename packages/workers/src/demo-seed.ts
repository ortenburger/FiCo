/**
 * Demo seed for the gamification flow (Topic 10, GAMIFICATION.md §2/§3/§6).
 *
 * Seeds the "Egon Demo" user so the gamification UI and the E2E smoke test
 * (packages/api/tests/gamification.e2e.test.ts) hit a populated profile:
 * a gamification profile, exactly one FinancialSnack to play and one completed
 * quest journal pair (quest award + its idempotency eventId).
 *
 * Conventions reused from packages/db/prisma/seed.ts (read-only reference):
 * fixed DEMO_USER_ID, upsert-only writes, friendly console summary.
 *
 * DESIGN RULE: this module holds no PrismaClient construction and never opens
 * a DB connection itself. `applyDemoSeed` receives the client as an argument —
 * tests pass an in-memory fake, production passes the singleton from @fico/db.
 * Run manually: pnpm --filter @fico/workers demo-seed (see index.ts wiring note
 * in the topic report).
 */

/**
 * Same fixed demo user as packages/db/prisma/seed.ts mirrors it from
 * app/src/App.tsx (DEMO_USER_ID) — the frontend talks to this id.
 */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export type DemoUserProfile = {
  userId: string;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  lastCheckInDate: Date | null;
  streakFreezeCount: number;
  totalXp: number;
  currentLevel: number;
  completedSnacks: string[];
  badges: string[];
};

export type DemoQuizOption = {
  id: string;
  text: string;
  correct: boolean;
};

export type DemoSeedSnack = {
  slug: string;
  category: "INVESTING" | "INSURANCE" | "ALTERSVORSORGE" | "HABITS";
  title: string;
  /** Free-form content payload rendered by the snack card (§5 layout). */
  content: {
    question: string;
    bite: string[];
    xpReward: number;
  };
  quiz: {
    question: string;
    options: DemoQuizOption[];
  };
};

export type DemoQuestCompletion = {
  questId: string;
  questTitle: string;
  /** §6 Quest 1.1 baseline award — journal pair for the completion. */
  award: {
    eventId: string;
    eventType: "QUEST_COMPLETED";
    xpAwarded: number;
  };
};

export type DemoSeedPayload = {
  /** Display name only — the User table has no name column. */
  displayName: string;
  user: {
    id: string;
    email: string;
    subscriptionTier: "FREE";
    /** Not stored in the DB; every seeded user needs a hash column value. */
    passwordHash: string;
  };
  profile: DemoUserProfile;
  snack: DemoSeedSnack;
  questCompletion: DemoQuestCompletion;
};

/**
 * Deterministic, instance-free payload. `now` is injectable so tests and demo
 * runs do not depend on the machine clock (same convention as Topic 2 streaks).
 *
 * The profile is a believable mid-week-2 state: one check-in claimed, the
 * demo snack still open (+25 XP), Quest 1.1 "Connect Bank" (+50 XP §6) done.
 */
export function buildDemoSeedPayload(now: Date = new Date()): DemoSeedPayload {
  const lastCheckInDate = startOfWeek(now);
  const totalXp = 200; // 150 check-in (§2/§3) + 50 quest 1.1 (§6)
  return {
    displayName: "Egon Demo",
    user: {
      id: DEMO_USER_ID,
      email: "demo@fico.local",
      subscriptionTier: "FREE",
      passwordHash: "demo-not-a-real-hash", // same convention as seed.ts
    },
    profile: {
      userId: DEMO_USER_ID,
      currentStreakWeeks: 2,
      longestStreakWeeks: 2,
      lastCheckInDate,
      streakFreezeCount: 1, // §2: every user starts with one earned freeze
      totalXp,
      // Levels are cumulative floors: 200 XP is still Level 1 (floor 300).
      currentLevel: 1,
      completedSnacks: [],
      badges: [],
    },
    snack: {
      slug: "ter-fee-drag",
      category: "INVESTING",
      title: "The Silent Wealth Killer — 1.5% TER",
      content: {
        question: "How much does a 1.5% ETF / fund fee REALLY cost?",
        bite: [
          "€200/month at 7% gross for 35 years:",
          "At 0.20% TER ≈ €335,000.",
          "At 1.80% TER ≈ €212,000.",
          "The innocent 1.6% delta devours €123,000+ — over 36% of your wealth!",
        ],
        xpReward: 25,
      },
      quiz: {
        question: "What does a management TER of 1.5% p.a. really mean for you?",
        options: [
          {
            id: "a",
            text: "Nothing — fees are only charged when I sell.",
            correct: false,
          },
          {
            id: "b",
            text: "Every year it compounds against you and can eat 36%+ of lifetime wealth.",
            correct: true,
          },
          {
            id: "c",
            text: "It is capped by the government at 0.5% p.a.",
            correct: false,
          },
        ],
      },
    },
    questCompletion: {
      questId: "quest-1.1-connect-bank",
      questTitle: "Connect Bank (AISP)",
      award: {
        eventId: "demo-quest-1.1-connect-bank",
        eventType: "QUEST_COMPLETED",
        xpAwarded: 50, // §6 Quest 1.1
      },
    },
  };
}

/**
 * Writes the payload through the passed client. No connection is opened here —
 * the client (real or fake) is provided by the caller.
 */
export async function applyDemoSeed(
  client: DemoSeedClient,
  payload: DemoSeedPayload,
): Promise<void> {
  await client.user.upsert({
    where: { id: payload.user.id },
    update: {},
    create: {
      id: payload.user.id,
      email: payload.user.email,
      passwordHash: payload.user.passwordHash,
      subscriptionTier: payload.user.subscriptionTier,
    },
  });

  const profileData = {
    currentStreakWeeks: payload.profile.currentStreakWeeks,
    longestStreakWeeks: payload.profile.longestStreakWeeks,
    lastCheckInDate: payload.profile.lastCheckInDate,
    streakFreezeCount: payload.profile.streakFreezeCount,
    totalXp: payload.profile.totalXp,
    currentLevel: payload.profile.currentLevel,
    completedSnacks: payload.profile.completedSnacks,
    badges: payload.profile.badges,
  };
  await client.userGamificationProfile.upsert({
    where: { userId: payload.profile.userId },
    create: { userId: payload.profile.userId, ...profileData },
    update: profileData,
  });

  await client.financialSnack.upsert({
    where: { slug: payload.snack.slug },
    create: { ...payload.snack },
    update: payload.snack,
  });

  await client.gamificationAward.create({
    data: {
      userId: payload.profile.userId,
      eventId: payload.questCompletion.award.eventId,
      eventType: payload.questCompletion.award.eventType,
      xpAwarded: payload.questCompletion.award.xpAwarded,
      meta: { questId: payload.questCompletion.questId, questTitle: payload.questCompletion.questTitle },
    },
  });
}

/**
 * Structural subset of the PrismaClient surface (method-style signatures keep
 * the real client assignable). Uses `Record<string, never>`-free plain objects
 * so both @prisma/client and test fakes snap in.
 */
export interface DemoSeedClient {
  user: {
    upsert(args: {
      where: { id: string };
      update: object;
      create: {
        id: string;
        email: string;
        passwordHash: string;
        subscriptionTier: "FREE";
      };
    }): Promise<unknown>;
  };
  userGamificationProfile: {
    upsert(args: {
      where: { userId: string };
      create: DemoUserProfile;
      update: Omit<DemoUserProfile, "userId">;
    }): Promise<unknown>;
  };
  financialSnack: {
    upsert(args: {
      where: { slug: string };
      create: DemoSeedSnack;
      update: DemoSeedSnack;
    }): Promise<unknown>;
  };
  gamificationAward: {
    create(args: {
      data: {
        userId: string;
        eventId: string;
        eventType: string;
        xpAwarded: number;
        meta?: Record<string, unknown>;
      };
    }): Promise<unknown>;
  };
}

/** Monday 00:00 of the ISO week containing `date` (UTC, deterministic). */
function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const offsetToMonday = (day + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - offsetToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}
