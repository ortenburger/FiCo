/**
 * Frontend DTOs for the gamification hub.
 *
 * Shapes mirror the backend contracts the other topic agents implement:
 * - `GamificationProfileDto`  = Topic 1's `UserGamificationProfileDto`
 *   (packages/gamification/src/types.ts) — dates as ISO strings.
 * - `WeeklyMoneyWrappedDto`   = Topic 5's story JSON (GAMIFICATION.md §3).
 * - `FinancialSnackDto`       = Topic 3's snack content (GAMIFICATION.md §5).
 * - `QuestChapterDto`         = Topic 4's chapter/quest config (§6).
 */

/** Flame tier per §2 streak thresholds (4/12/26/52 weeks). */
export type FlameTier = "none" | "bronze" | "silver" | "gold" | "diamond";

export type GamificationProfileDto = {
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
};

export type SnackQuizOption = {
  id: string;
  text: string;
  /** Server authority; only trusted for feedback display, never pre-marked in UI. */
  correct?: boolean;
};

export type FinancialSnackDto = {
  id: string;
  slug: string;
  category: "INVESTING" | "INSURANCE" | "ALTERSVORSORGE" | "HABITS";
  number: number;
  /** The hook question shown as headline. */
  title: string;
  /** The 90-second bite (2–4 lines). */
  bite: string[];
  /** The quiz question. */
  question: string;
  options: SnackQuizOption[];
  xpReward: number;
  wrongXpPenalty: number;
};

export type QuestNodeDto = {
  id: string;
  chapter: number;
  emoji: string;
  title: string;
  xp: number;
  completed: boolean;
  /** Which completion unlocks this one (within-chapter chain). */
  requires: string | null;
  detail: string;
};

export type QuestChapterDto = {
  chapter: number;
  title: string;
  quests: QuestNodeDto[];
};

export type WeeklyMoneyWrappedDto = {
  weekNumber: number;
  year: number;
  xpEarned: number;
  streak: {
    weeks: number;
    isStreakActive: boolean;
  };
  cashflowPulse: {
    income: number;
    fixedCosts: number;
    discretionarySpend: number;
    discretionaryWithinTarget: boolean;
    freeSurplus: number;
    routingNote: string;
  };
  emergencyShield: {
    percent: number;
    targetLabel: string;
    deltaThisWeek: number;
  };
  bossDamage: {
    monster: string;
    lifetimeFeesAvoided: number;
    damageThisWeek: number;
  };
  agenticHighlight: {
    emoji: string;
    habit: string;
    savedThisMonth: number;
    depotProjection: string;
  };
};

/** Cooperative guild card (mirrors `@fico/gamification` GuildMetrics). */
export type GuildMetricsDto = {
  debtEliminatedEur: number;
  feesAvoidedEur: number;
  combinedStreakWeeks: number;
  snacksMastered: number;
};

export type GuildDto = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  metrics: GuildMetricsDto;
  activePerk: string;
};

/** One hub load, whatever the data source. */
export type GamificationHubData = {
  dataSource: "api" | "demo";
  profile: GamificationProfileDto;
  wrapped: WeeklyMoneyWrappedDto;
  snacks: FinancialSnackDto[];
  chapters: QuestChapterDto[];
  guild: GuildDto;
};

/** Result of answering a snack quiz. */
export type SnackAnswerResult = {
  correct: boolean;
  xpGained: number;
  correctOptionId: string | null;
};

/** Result of a weekly check-in. */
export type CheckInResult = {
  xpGained: number;
  currentStreakWeeks: number;
};
