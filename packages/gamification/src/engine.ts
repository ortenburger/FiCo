import { levelForXp, levelTitle } from "./levels.js";
import type { GamificationStore } from "./store.js";
import type {
  AwardJournalEntry,
  AwardResult,
  BadgeRule,
  EngineConfig,
  FicoEvent,
  GamificationProfileData,
  UserGamificationProfileDto,
} from "./types.js";

/**
 * XP defaults for well-known event types (GAMIFICATION.md §2 & §5).
 * Quest XP (50–500 per §6) is always passed via `meta.xp` by the quest layer.
 */
const DEFAULT_EVENT_XP: Record<string, number> = {
  BANK_CONNECTED: 50, // Quest 1.1 baseline
  CHECK_IN: 150, // Sunday Money Ritual claim (§3 recap shows +150 XP)
  SNACK_CORRECT: 25,
  SNACK_WRONG: -5,
};

const EMPTY_RESULT: AwardResult = { xpGained: 0, badgesEarned: [] };

export class GamificationEngine {
  private readonly store: GamificationStore;
  private readonly eventXp: Record<string, number>;
  private readonly defaultXp: number;
  private readonly badgeRules: BadgeRule[];

  constructor(store: GamificationStore, config: EngineConfig = {}) {
    this.store = store;
    this.eventXp = config.eventXp ?? DEFAULT_EVENT_XP;
    this.defaultXp = config.defaultXp ?? 0;
    this.badgeRules = config.badgeRules ?? [];
  }

  /**
   * Applies one event to the user's profile.
   *
   * Idempotent: when `event.eventId` was already journaled for this user the
   * event is skipped and a zero award is returned. XP never goes below 0, so
   * level progression is monotonic.
   */
  async emit(userId: string, event: FicoEvent): Promise<AwardResult> {
    if (event.eventId !== undefined && (await this.store.hasAward(userId, event.eventId))) {
      return EMPTY_RESULT;
    }

    const profile = await this.ensureProfile(userId);
    const xpGained = this.resolveXp(event);

    const next: GamificationProfileData = {
      ...profile,
      totalXp: Math.max(0, profile.totalXp + xpGained),
    };
    // Levels (§6 titles) are earned milestones — a negative snack answer can
    // zero XP but never demotes an already reached level.
    next.currentLevel = Math.max(profile.currentLevel, levelForXp(next.totalXp));

    const badgesEarned = this.collectBadges(event, profile, next);
    if (badgesEarned.length > 0) {
      next.badges = [...next.badges, ...badgesEarned];
    }

    const saved = await this.store.saveProfile(userId, next);
    await this.store.recordAward(this.toJournalEntry(userId, event, xpGained));

    const result: AwardResult = { xpGained, badgesEarned };
    if (saved.currentLevel > profile.currentLevel) {
      result.levelUp = {
        level: saved.currentLevel,
        title: levelTitle(saved.currentLevel),
      };
    }
    return result;
  }

  async getProfile(userId: string): Promise<UserGamificationProfileDto | null> {
    const profile = await this.store.loadProfile(userId);
    if (!profile) return null;
    return {
      userId: profile.userId,
      totalXp: profile.totalXp,
      currentLevel: profile.currentLevel,
      levelTitle: levelTitle(profile.currentLevel),
      currentStreakWeeks: profile.currentStreakWeeks,
      longestStreakWeeks: profile.longestStreakWeeks,
      lastCheckInDate: profile.lastCheckInDate?.toISOString() ?? null,
      streakFreezeCount: profile.streakFreezeCount,
      completedSnacks: profile.completedSnacks,
      badges: profile.badges,
    };
  }

  private resolveXp(event: FicoEvent): number {
    const metaXp = event.meta?.xp;
    if (typeof metaXp === "number" && Number.isFinite(metaXp)) return Math.trunc(metaXp);
    const configured = this.eventXp[event.type];
    if (typeof configured === "number") return configured;
    return this.defaultXp;
  }

  private collectBadges(
    event: FicoEvent,
    before: GamificationProfileData,
    after: GamificationProfileData,
  ): string[] {
    return this.badgeRules
      .filter((rule) => !before.badges.includes(rule.badge))
      .filter((rule) => safeRule(rule, event, after))      .map((rule) => rule.badge);
  }

  private async ensureProfile(userId: string): Promise<GamificationProfileData> {
    const existing = await this.store.loadProfile(userId);
    if (existing) return existing;
    return this.store.saveProfile(userId, {
      userId,
      currentStreakWeeks: 0,
      longestStreakWeeks: 0,
      lastCheckInDate: null,
      streakFreezeCount: 1, // §2: every user starts with one earned freeze
      totalXp: 0,
      currentLevel: 1,
      completedSnacks: [],
      badges: [],
    });
  }

  private toJournalEntry(
    userId: string,
    event: FicoEvent,
    xpGained: number,
  ): AwardJournalEntry {
    return {
      userId,
      eventId: event.eventId ?? null,
      eventType: event.type,
      xpAwarded: xpGained,
      meta: event.meta,
      createdAt: new Date(),
    };
  }
}

/** Badge rule evaluation must never break the award path. */
function safeRule(rule: BadgeRule, event: FicoEvent, profile: GamificationProfileData): boolean {
  try {
    return rule.when(event, profile);
  } catch {
    return false;
  }
}
