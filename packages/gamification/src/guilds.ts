/**
 * Cooperative Financial Guilds (GAMIFICATION.md §7).
 *
 * Cooperative only: groups aggregate *their shared progress* (debt eliminated,
 * fees avoided, combined streak weeks, snacks mastered) and unlock group
 * badges / milestone celebrations. There is NO leaderboard, NO ranking and
 * NO net-worth exposure anywhere in this module — see the design note in
 * guild-types.ts for the §7 rationale.
 *
 * Decoupling: `computeGuildMetrics` is a pure function over per-member stat
 * inputs, so the gamification layer never imports `@fico/ledger` directly.
 * A caller (integration note, orchestrator/Wrapped job → Topic 5/10) is
 * responsible for producing `GuildMemberStats^{userId}` from ledger
 * aggregates, streak profiles and snack completions.
 *
 * No DB: `InMemoryGuildRegistry` is an in-memory fake; a Prisma adapter for
 * the Guild / GuildMember models (Topic 1 schema) can wrap the same functions.
 */

import {
  GuildError,
  MAX_GUILD_SIZE,
  type Guild,
  type GuildMemberStats,
  type GuildMetrics,
  type GuildMilestone,
  type GuildMetricKey,
  type GuildReward,
} from "./guild-types.js";

export * from "./guild-types.js";

/// ── Guild bookkeeping (create / join / leave) ───────────────────────────

/**
 * Minimal guild state store so the operations below stay free functions.
 * In-memory only — swap the implementation for a Prisma store later.
 */
export interface GuildRegistry {
  guilds: Map<string, Guild>;
  nextId: number;
}

export function createInMemoryGuildRegistry(): GuildRegistry {
  return { guilds: new Map(), nextId: 1 };
}

function requireGuild(registry: GuildRegistry, guildId: string): Guild {
  const guild = registry.guilds.get(guildId);
  if (!guild) throw new GuildError("GUILD_NOT_FOUND", `No guild with id "${guildId}".`);
  return guild;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new GuildError("INVALID_NAME", "Guild name must not be empty.");
  return trimmed;
}

/** Creates a guild and returns it. Names must be unique (deterministic errors). */
export function createGuild(registry: GuildRegistry, name: string): Guild {
  const trimmed = requireName(name);
  for (const guild of registry.guilds.values()) {
    if (guild.name === trimmed) {
      throw new GuildError("NAME_TAKEN", `A guild named "${trimmed}" already exists.`);
    }
  }
  const guild: Guild = {
    id: `guild-${registry.nextId++}`,
    name: trimmed,
    createdAt: new Date(0),
    memberIds: [],
  };
  registry.guilds.set(guild.id, guild);
  return guild;
}

/** Adds a user to a guild. Idempotence is NOT assumed: joining twice is an error. */
export function joinGuild(registry: GuildRegistry, guildId: string, userId: string): Guild {
  const trimmed = userId.trim();
  if (trimmed.length === 0) throw new GuildError("NOT_A_MEMBER", "userId must not be empty.");
  const guild = requireGuild(registry, guildId);
  if (guild.memberIds.includes(userId)) {
    throw new GuildError("ALREADY_MEMBER", `${userId} is already a member of "${guild.name}".`);
  }
  if (guild.memberIds.length >= MAX_GUILD_SIZE) {
    throw new GuildError(
      "GUILD_FULL",
      `Guild "${guild.name}" is full (max ${MAX_GUILD_SIZE} members).`,
    );
  }
  guild.memberIds.push(userId);
  return guild;
}

/** Removes a user from a guild. Leaving twice is an error. */
export function leaveGuild(registry: GuildRegistry, guildId: string, userId: string): Guild {
  const guild = requireGuild(registry, guildId);
  const index = guild.memberIds.indexOf(userId);
  if (index === -1) {
    throw new GuildError("NOT_A_MEMBER", `${userId} is not a member of "${guild.name}".`);
  }
  guild.memberIds.splice(index, 1);
  return guild;
}

/// ── Pure aggregation ─────────────────────────────────────────────────────

/**
 * Validates one personal stat field: must be a finite, non-negative number.
 * Rejecting NaN/±Infinity/negatives here means null-stat guild bugs can never
 * silently produce `NaN` displays — exactly the failure mode cooperative
 * metrics are most vulnerable to.
 */
function field(member: GuildMemberStats, key: keyof Omit<GuildMemberStats, "userId">): number {
  const value = member[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `GuildMemberStats "${member.userId}" has invalid ${key}: ${String(value)} (finite ≥ 0 required).`,
    );
  }
  return value;
}

/**
 * Aggregates member stat inputs into guild metrics (§7 combined metrics).
 * Pure: same input ⇒ same output, no registry/DB/time dependence.
 * An empty member list yields all zeros (an empty guild shows 0/0/0/0, never NaN).
 */
export function computeGuildMetrics(members: readonly GuildMemberStats[]): GuildMetrics {
  const metrics = { debtEliminatedEur: 0, feesAvoidedEur: 0, combinedStreakWeeks: 0, snacksMastered: 0 };
  for (const member of members) {
    metrics.debtEliminatedEur += field(member, "debtEliminatedEur");
    metrics.feesAvoidedEur += field(member, "feesAvoidedEur");
    metrics.combinedStreakWeeks += field(member, "currentStreakWeeks");
    metrics.snacksMastered += field(member, "snacksMastered");
  }
  return metrics;
}

/// ── Milestone badges (§7 team rewards) ──────────────────────────────────

/**
 * Milestone thresholds "as data", in stable output order. Every metric maps to
 * one group badge the guild unlocks together when its aggregate clears the
 * threshold (GAMIFICATION.md §7: "Unlocking group badges and shared milestone
 * celebrations").
 */
const GUILD_MILESTONES: readonly GuildMilestone[] = [
  { badge: "Debt Slayers", metric: "debtEliminatedEur", threshold: 10_000 },
  { badge: "Fee Demolition Crew", metric: "feesAvoidedEur", threshold: 50_000 },
  { badge: "Twelve Weeks United", metric: "combinedStreakWeeks", threshold: 12 },
  { badge: "Hundred Snacks Society", metric: "snacksMastered", threshold: 100 },
];

/** Snapshot of all four guild milestones with unlocked/reached state. */
export interface GuildMilestoneStatus {
  badge: string;
  metric: GuildMetricKey;
  threshold: number;
  value: number;
  unlocked: boolean;
}

/** Returns every milestone in a stable order (definition order; ties are impossible here). */
export function evaluateGuildMilestones(metrics: GuildMetrics): GuildMilestoneStatus[] {
  return GUILD_MILESTONES.map((milestone) => ({
    badge: milestone.badge,
    metric: milestone.metric,
    threshold: milestone.threshold,
    value: metrics[milestone.metric],
    unlocked: metrics[milestone.metric] >= milestone.threshold,
  }));
}

/**
 * The team rewards a guild has actually unlocked (§7 group badges), sorted
 * alphabetically by badge name — a deterministic, name-based order (not by
 * "size" of the achievement), matching the cooperative, anti-leaderboard stance.
 */
export function listEarnedGuildRewards(metrics: GuildMetrics): GuildReward[] {
  return GUILD_MILESTONES.filter((m) => metrics[m.metric] >= m.threshold)
    .map((m) => ({ badge: m.badge, metric: m.metric, threshold: m.threshold, value: metrics[m.metric] }))
    .sort((a, b) => (a.badge === b.badge ? a.metric.localeCompare(b.metric) : a.badge.localeCompare(b.badge)));
}
