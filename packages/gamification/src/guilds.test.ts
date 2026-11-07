import { describe, expect, it } from "vitest";
import {
  computeGuildMetrics,
  createGuild,
  createInMemoryGuildRegistry,
  evaluateGuildMilestones,
  GuildError,
  joinGuild,
  leaveGuild,
  listEarnedGuildRewards,
  MAX_GUILD_SIZE,
} from "./guilds.js";
import type { GuildMemberStats } from "./guild-types.js";

/** §7 spec example: €14,800 debt eliminated, €89,200 fees avoided, 38 weeks, 142 snacks. */
const SPEC_MEMBERS: GuildMemberStats[] = [
  { userId: "u-egon", debtEliminatedEur: 8_000, feesAvoidedEur: 40_200, currentStreakWeeks: 13, snacksMastered: 60 },
  { userId: "u-liesl", debtEliminatedEur: 5_800, feesAvoidedEur: 30_000, currentStreakWeeks: 12, snacksMastered: 52 },
  { userId: "u-otzi", debtEliminatedEur: 1_000, feesAvoidedEur: 19_000, currentStreakWeeks: 13, snacksMastered: 30 },
];

describe("guild bookkeeping (create / join / leave)", () => {
  it("creates a guild with a deterministic id and starts empty", () => {
    const registry = createInMemoryGuildRegistry();
    const guild = createGuild(registry, "Stuttgart Founders Guild");

    expect(guild).toMatchObject({ id: "guild-1", name: "Stuttgart Founders Guild", memberIds: [] });
    expect(registry.guilds.get("guild-1")).toBe(guild);

    const second = createGuild(registry, "Berlin Sparrunde");
    expect(second.id).toBe("guild-2"); // counter increments — deterministic, no random ids
  });

  it("rejects empty/blank names as INVALID_NAME", () => {
    expect(() => createGuild(createInMemoryGuildRegistry(), "   ")).toThrow(GuildError);
  });

  it("renders name uniqueness deterministically as NAME_TAKEN", () => {
    const registry = createInMemoryGuildRegistry();
    createGuild(registry, "Stuttgart Founders Guild");
    expect(() => createGuild(registry, "Stuttgart Founders Guild")).toThrowError(/already exists/);
  });

  it("joins and leaves members in join order", () => {
    const registry = createInMemoryGuildRegistry();
    const { id } = createGuild(registry, "Stuttgart Founders Guild");

    joinGuild(registry, id, "u-egon");
    joinGuild(registry, id, "u-liesl");
    expect(registry.guilds.get(id)?.memberIds).toEqual(["u-egon", "u-liesl"]);

    leaveGuild(registry, id, "u-egon");
    expect(registry.guilds.get(id)?.memberIds).toEqual(["u-liesl"]);

    // re-joining after leaving is fine
    joinGuild(registry, id, "u-egon");
    expect(registry.guilds.get(id)?.memberIds).toEqual(["u-liesl", "u-egon"]);
  });

  it("throws NOT_A_MEMBER / ALREADY_MEMBER / GUILD_NOT_FOUND cleanly", () => {
    const registry = createInMemoryGuildRegistry();
    const { id } = createGuild(registry, "Stuttgart Founders Guild");

    expect(() => joinGuild(registry, "guild-999", "u-x")).toThrow(/GUILD_NOT_FOUND|No guild/);
    expect(() => leaveGuild(registry, id, "u-egon")).toThrowError(/not a member/);
    joinGuild(registry, id, "u-egon");
    expect(() => joinGuild(registry, id, "u-egon")).toThrowError(/already a member/);
  });

  it(`rejects the 26th join with GUILD_FULL (max ${MAX_GUILD_SIZE})`, () => {
    const registry = createInMemoryGuildRegistry();
    const { id } = createGuild(registry, "Full House");

    for (let i = 1; i <= MAX_GUILD_SIZE; i++) {
      expect(joinGuild(registry, id, `u-${i}`).memberIds).toHaveLength(i);
    }
    expect(() => joinGuild(registry, id, "u-26")).toThrowError(/full \(max 25 members\)/);

    // after one member leaves, a slot frees up again
    leaveGuild(registry, id, "u-1");
    expect(joinGuild(registry, id, "u-26").memberIds).toHaveLength(MAX_GUILD_SIZE);
  });
});

describe("computeGuildMetrics (pure aggregation)", () => {
  it("aggregates the §7 spec-example fixture exactly", () => {
    expect(computeGuildMetrics(SPEC_MEMBERS)).toEqual({
      debtEliminatedEur: 14_800,
      feesAvoidedEur: 89_200,
      combinedStreakWeeks: 38, // sum of member streak weeks (see guild-types.ts comment)
      snacksMastered: 142,
    });
  });

  it("yields plain zeros — never NaN — for an empty guild", () => {
    expect(computeGuildMetrics([])).toEqual({
      debtEliminatedEur: 0,
      feesAvoidedEur: 0,
      combinedStreakWeeks: 0,
      snacksMastered: 0,
    });
  });

  it("rejects NaN/Infinity/negative inputs instead of propagating NaN", () => {
    expect(() =>
      computeGuildMetrics([{ userId: "u-bad", debtEliminatedEur: Number.NaN, feesAvoidedEur: 0, currentStreakWeeks: 0, snacksMastered: 0 }]),
    ).toThrow(TypeError);
    expect(() =>
      computeGuildMetrics([{ userId: "u-bad", debtEliminatedEur: -1, feesAvoidedEur: 0, currentStreakWeeks: 0, snacksMastered: 0 }]),
    ).toThrow(TypeError);
    expect(() =>
      computeGuildMetrics([{ userId: "u-bad", debtEliminatedEur: Infinity, feesAvoidedEur: 0, currentStreakWeeks: 0, snacksMastered: 0 }]),
    ).toThrow(TypeError);
  });

  it("is pure: repeated calls give identical results and mutate nothing", () => {
    const snapshot = JSON.stringify(SPEC_MEMBERS);
    const first = computeGuildMetrics(SPEC_MEMBERS);
    expect(computeGuildMetrics(SPEC_MEMBERS)).toEqual(first);
    expect(JSON.stringify(SPEC_MEMBERS)).toBe(snapshot);
  });
});

describe("guild milestone badges (§7 team rewards)", () => {
  it("unlocks ALL four team badges on the §7 example metrics", () => {
    const metrics = computeGuildMetrics(SPEC_MEMBERS);
    expect(metrics.snacksMastered).toBe(142); // fixture sanity

    const earned = listEarnedGuildRewards(metrics);
    expect(earned.map((r) => r.badge)).toEqual([
      "Debt Slayers",
      "Fee Demolition Crew",
      "Hundred Snacks Society",
      "Twelve Weeks United",
    ]); // alphabetical by badge name — deterministic, not 'performance' order
    expect(earned[0]).toEqual({ badge: "Debt Slayers", metric: "debtEliminatedEur", threshold: 10_000, value: 14_800 });
  });

  it("flips each badge exactly at its threshold (edge: just below vs at)", () => {
    const justBelow = { debtEliminatedEur: 9_999.99, feesAvoidedEur: 49_999.99, combinedStreakWeeks: 11, snacksMastered: 99 };
    const atThreshold = { debtEliminatedEur: 10_000, feesAvoidedEur: 50_000, combinedStreakWeeks: 12, snacksMastered: 100 };

    expect(listEarnedGuildRewards(justBelow)).toEqual([]); // near-misses unlock nothing
    expect(evaluateGuildMilestones(justBelow).every((m) => !m.unlocked)).toBe(true);

    expect(evaluateGuildMilestones(atThreshold).map((m) => m.unlocked)).toEqual([true, true, true, true]);
    expect(listEarnedGuildRewards(atThreshold).map((r) => r.badge)).toHaveLength(4);
  });

  it("returns milestone status in stable definition order and names tie-break deterministically", () => {
    const partial = { debtEliminatedEur: 10_000, feesAvoidedEur: 0, combinedStreakWeeks: 12, snacksMastered: 0 };
    const statuses = evaluateGuildMilestones(partial);
    expect(statuses.map((m) => m.metric)).toEqual([
      "debtEliminatedEur",
      "feesAvoidedEur",
      "combinedStreakWeeks",
      "snacksMastered",
    ]); // stable order, same input ⇒ same output
    /* Programming note: within equal milestone *status* the earned list is
       alphabetical by badge name (localeCompare), never by size of the
       achievement — see the "no leaderboards" design note in guild-types.ts. */
  });
});
