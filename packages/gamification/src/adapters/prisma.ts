import type { PrismaClient, Prisma } from "@fico/db";
import type { GamificationStore } from "../store.js";
import type {
  AwardJournalEntry,
  GamificationProfileData,
} from "../types.js";

/** Row shape of the Prisma `user_gamification_profiles` table. */
type ProfileRow = Awaited<
  ReturnType<PrismaClient["userGamificationProfile"]["findFirstOrThrow"]>
>;

/**
 * Prisma-backed GamificationStore on top of @fico/db's Postgres schema
 * (user_gamification_profiles + gamification_awards migration).
 */
export class PrismaStore implements GamificationStore {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async loadProfile(userId: string): Promise<GamificationProfileData | null> {
    const row = await this.prisma.userGamificationProfile.findUnique({
      where: { userId },
    });
    return row ? fromRow(row) : null;
  }

  async saveProfile(
    userId: string,
    profile: GamificationProfileData,
  ): Promise<GamificationProfileData> {
    const data = {
      currentStreakWeeks: profile.currentStreakWeeks,
      longestStreakWeeks: profile.longestStreakWeeks,
      lastCheckInDate: profile.lastCheckInDate,
      streakFreezeCount: profile.streakFreezeCount,
      totalXp: profile.totalXp,
      currentLevel: profile.currentLevel,
      completedSnacks: profile.completedSnacks,
      badges: profile.badges,
    };
    const row = await this.prisma.userGamificationProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return fromRow(row);
  }

  async hasAward(userId: string, eventId: string): Promise<boolean> {
    const found = await this.prisma.gamificationAward.findUnique({
      where: { uq_gamification_awards_user_event: { userId, eventId } },
      select: { id: true },
    });
    return found !== null;
  }

  async recordAward(entry: AwardJournalEntry): Promise<void> {
    await this.prisma.gamificationAward.create({
      data: {
        userId: entry.userId,
        eventId: entry.eventId ?? null,
        eventType: entry.eventType,
        xpAwarded: entry.xpAwarded,
        meta: entry.meta as Prisma.InputJsonObject | undefined,
        createdAt: entry.createdAt,
      },
    });
  }
}

function fromRow(row: ProfileRow): GamificationProfileData {
  return {
    userId: row.userId,
    currentStreakWeeks: row.currentStreakWeeks,
    longestStreakWeeks: row.longestStreakWeeks,
    lastCheckInDate: row.lastCheckInDate,
    streakFreezeCount: row.streakFreezeCount,
    totalXp: row.totalXp,
    currentLevel: row.currentLevel,
    completedSnacks: asStringArray(row.completedSnacks),
    badges: asStringArray(row.badges),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
