/**
 * Cooperative Financial Guilds (GAMIFICATION.md §7).
 *
 * ── DESIGN NOTE: NO LEADERBOARDS, NO NET-WORTH EXPOSURE ────────────────────
 * §7 is explicitly cooperative: a guild works *together* toward shared
 * milestones ("Unlocking group badges and shared milestone celebrations").
 * There is deliberately:
 *   • no `listGuildsByRank` / ranking / sorting of guilds or members,
 *   • no per-member score surfaced anywhere in these types,
 *   • no net-worth field at all.
 * `GuildMemberStats` only carries *progress deltas* (debt eliminated,
 * fees avoided, streak weeks, snacks mastered) — never balances or totals a
 * member could be compared on. Metrics are aggregated to the guild, then read
 * against milestone thresholds. Members see the team number, not a ranking.
 * Sorting, where an order exists, is broken deterministically by name —
 * never by "performance" of a member.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Personal progress inputs for one guild member, pulled per user (not per guild). */
export interface GuildMemberStats {
  userId: string;
  /** High-interest debt eliminated by this member, in euros. Delta on their own journey. */
  debtEliminatedEur: number;
  /** Hidden broker fees avoided by this member, in euros. */
  feesAvoidedEur: number;
  /** This member's current streak duration in weeks (Topic 2 streak system territory). */
  currentStreakWeeks: number;
  /** Financial Snacks lessons this member has completed (GAMIFICATION.md §5). */
  snacksMastered: number;
}

/** Guild-level aggregate produced by `computeGuildMetrics`. */
export interface GuildMetrics {
  debtEliminatedEur: number;
  feesAvoidedEur: number;
  /**
   * Sum of every member's current streak weeks ("combined"). For the spec
   * example (GAMIFICATION.md §7) that is 3 members × ~13 weeks ⇒ 38 weeks.
   * Interpretation per topic brief: sum across members, NOT an average or a
   * "days as a guild" measure — the number grows because the team grows,
   * which is the cooperative framing §7 describes.
   */
  combinedStreakWeeks: number;
  snacksMastered: number;
}

/** Fixed, stable metric order used by all milestone evaluations. */
export type GuildMetricKey =
  | "debtEliminatedEur"
  | "feesAvoidedEur"
  | "combinedStreakWeeks"
  | "snacksMastered";

/** One guild milestone definition (data, in stable order). */
export interface GuildMilestone {
  badge: string;
  metric: GuildMetricKey;
  threshold: number;
}

/** A badge the guild has actually unlocked. */
export interface GuildReward {
  badge: string;
  metric: GuildMetricKey;
  threshold: number;
  value: number;
}

/** A cohort of users working toward shared financial milestones. */
export interface Guild {
  id: string;
  name: string;
  createdAt: Date;
  /** Ordered by join time — never ranked, ids only (no user metrics here). */
  memberIds: string[];
}

/// ── Error codes ──────────────────────────────────────────────────────────

export type GuildErrorCode =
  | "INVALID_NAME"
  | "NAME_TAKEN"
  | "GUILD_NOT_FOUND"
  | "GUILD_FULL"
  | "ALREADY_MEMBER"
  | "NOT_A_MEMBER";

/** Thrown (not returned) for guild bookkeeping violations — keeps the API call-site honest. */
export class GuildError extends Error {
  readonly code: GuildErrorCode;

  constructor(code: GuildErrorCode, message: string) {
    super(message);
    this.name = "GuildError";
    this.code = code;
  }
}

/** Maximum guild size — a real circle of friends/colleagues, not a stadium (§7). */
export const MAX_GUILD_SIZE = 25;
