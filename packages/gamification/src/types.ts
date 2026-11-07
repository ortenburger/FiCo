/**
 * Core types of the FiCo gamification layer (GAMIFICATION.md §8).
 *
 * The layer is fully decoupled from the double-entry ledger: all state lives in
 * the gamification tables and only aggregates (savings, fees avoided) are read
 * from other domains — never written.
 */

/** Domain event pushed into the engine. `eventId` enables idempotent replay. */
export type FicoEvent = {
  type: string;
  /** Canonical business subject (e.g. snack id, quest id, policy id) */
  subjectId?: string;
  /** Uniquely identifies this event occurrence — repeats are no-ops. */
  eventId?: string;
  meta?: Record<string, unknown>;
};

export type AwardResult = {
  xpGained: number;
  levelUp?: { level: number; title: string };
  badgesEarned: string[];
};

/** Full gamification profile state, as kept by the store. */
export type GamificationProfileData = {
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

/** API-facing projection of the profile (dates as ISO strings). */
export interface UserGamificationProfileDto {
  userId: string;
  totalXp: number;
  currentLevel: number;
  levelTitle: string;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  lastCheckInDate: string | null;
  streakFreezeCount: number;
  completedSnacks: string[];
  badges: string[];
}

/** A badge is granted when `when` returns true and not owned yet. */
export interface BadgeRule {
  badge: string;
  when(event: FicoEvent, profile: GamificationProfileData): boolean;
}

export interface EngineConfig {
  /** XP per event type. Per-event `meta.xp` always wins over this table. */
  eventXp?: Record<string, number>;
  /** XP applied when neither `meta.xp` nor `eventXp[type]` matches. Default 0. */
  defaultXp?: number;
  badgeRules?: BadgeRule[];
}

/** Immutable record of one XP award, backing eventId idempotency. */
export interface AwardJournalEntry {
  userId: string;
  eventId?: string | null;
  eventType: string;
  xpAwarded: number;
  meta?: Record<string, unknown>;
  createdAt: Date;
}
