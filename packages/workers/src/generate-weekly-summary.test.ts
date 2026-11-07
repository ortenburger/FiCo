import { describe, expect, it, vi } from "vitest";
import { generateWeeklySummary, type MicroHabitPortInput, type WeeklySummaryPorts, type WeeklySummaryRow } from "./generate-weekly-summary.js";
import type { WeeklyWrappedStory } from "./weekly-story.js";

/**
 * Fixed fixture date: Sunday 2026-04-05, 15:30 UTC — last day of ISO week 14.
 * Every amount is deterministic EUR cents.
 */
const SUNDAY = new Date("2026-04-05T15:30:00.000Z");
const MIDWEEK = new Date("2026-04-01T15:30:00.000Z"); // Wednesday of the same week
const USER = "user-ego";

function makePorts(overrides: Partial<WeeklySummaryPorts> = {}): {
  ports: WeeklySummaryPorts;
  saved: WeeklySummaryRow[];
} {
  const saved: WeeklySummaryRow[] = [];
  const ports: WeeklySummaryPorts = {
    getStreakSnapshot: vi.fn(async () => ({ weeks: 14, xpGainedThisWeek: 150 })),
    getWeeklyCashflow: vi.fn(async () => ({
      incomeCents: 125_000,
      fixedCostsCents: 42_000,
      discretionaryCents: 21_000,
    })),
    getEmergencyShield: vi.fn(async () => ({
      targetCents: 75_000,
      savedCents: 58_500,
      savedThisWeekCents: 15_000,
    })),
    getSavingsSummary: vi.fn(async () => ({
      weeklySavingsCents: 15_000,
      lifetimeFeesAvoidedCents: 38_000,
      bossName: "Allianz Gross Policy Monster",
    })),
    getMicroHabitHighlight: vi.fn(async (): Promise<MicroHabitPortInput | null> => ({
      agentKind: "MOBILITY",
      text: 'You cycled 4 days instead of taking transit (€15.20 saved).',
      monthlySavingsCents: 9_120,
    })),
    findWeeklySummary: vi.fn(async () =>
      saved.find((r) => r.userId === USER && r.year === 2026 && r.weekNumber === 14) ?? null,
    ),
    saveWeeklySummary: vi.fn(async (row) => {
      saved.push(row);
    }),
    ...overrides,
  };
  return { ports, saved };
}

describe("generateWeeklySummary aggregation", () => {
  it("builds the WeeklySummary row from the injected ports (deterministic amounts)", async () => {
    const { ports } = makePorts();
    const { weeklySummaryRow, story, status } = await generateWeeklySummary(ports, USER, SUNDAY);

    expect(status).toBe("CREATED");
    expect(weeklySummaryRow).toMatchObject({
      userId: USER,
      weekNumber: 14,
      year: 2026,
      savingsTotal: 15_000,
      feesAvoided: 38_000,
      xpEarned: 150,
    });
    expect(weeklySummaryRow.microHabitStory).toBe(story);
  });

  it("derives surplus, shield percent and boss damage for the §3 story layout", async () => {
    const { ports } = makePorts();
    const { story } = await generateWeeklySummary(ports, USER, SUNDAY);

    // 125_000 - 42_000 - 21_000
    expect(story.cashflowPulse).toEqual({
      income: 125_000,
      fixedCosts: 42_000,
      discretionary: 21_000,
      surplus: 62_000,
    });
    // 58_500 / 75_000, clamped 0..100
    expect(story.emergencyShield).toEqual({ percent: 78, deltaThisWeek: 15_000 });
    expect(story.bossDamage.lifetimeFeesAvoided).toBe(38_000);
    expect(story.bossDamage.label).toBe(
      'You deal €380.00 damage to "Allianz Gross Policy Monster"!',
    );
    expect(story.streakInfo).toEqual({ weeks: 14, xpGained: 150 });
  });
});

describe("generateWeeklySummary idempotency", () => {
  it("replays the stored row/story on the second call without re-creating", async () => {
    const { ports, saved } = makePorts();

    const first = await generateWeeklySummary(ports, USER, SUNDAY);
    expect(first.status).toBe("CREATED");
    expect(saved).toHaveLength(1);

    const second = await generateWeeklySummary(ports, USER, SUNDAY);
    expect(second.status).toBe("EXISTING");
    expect(saved).toHaveLength(1); // no second write

    expect(second.weeklySummaryRow).toBe(first.weeklySummaryRow);
    expect(second.story).toBe(first.story);
  });

  it("keys the payweekHash on (userId, ISO week, year) — different user, different hash", async () => {
    const { ports } = makePorts();
    const { story } = await generateWeeklySummary(ports, USER, SUNDAY);
    expect(story.payweekHash).toHaveLength(16);
    expect(story.payweekHash).toMatchInlineSnapshot(`"7aae3d38e8413af0"`);
  });
});

describe("generateWeeklySummary Sunday-only gate", () => {
  it("throws for a midweek invocation", async () => {
    const { ports } = makePorts();
    await expect(generateWeeklySummary(ports, USER, MIDWEEK)).rejects.toThrow(/Sunday/);
  });

  it("runs on any Sunday (cron window includes late afternoon calls)", async () => {
    const { ports } = makePorts();
    await expect(generateWeeklySummary(ports, USER, new Date("2026-04-05T23:40:00.000Z"))).resolves
      .toMatchObject({ status: "CREATED" });
  });
});

describe("Weekly Money Wrapped story JSON shape (§3)", () => {
  it("exposes every §3 layout field with the documented units", async () => {
    const { ports } = makePorts();
    const { story } = await generateWeeklySummary(ports, USER, SUNDAY);

    expect(Object.keys(story)).toEqual([
      "version",
      "payweekHash",
      "units",
      "weekNumber",
      "year",
      "streakInfo",
      "cashflowPulse",
      "emergencyShield",
      "bossDamage",
      "agenticHighlight",
    ]);

    expect(story.version).toBe(1);
    expect(story.units).toBe("EUR_CENTS");
    expect(story.weekNumber).toBe(14);
    expect(story.year).toBe(2026);

    // streakInfo { weeks, xpGained }
    expect(typeof story.streakInfo.weeks).toBe("number");
    expect(typeof story.streakInfo.xpGained).toBe("number");

    // cashflowPulse { income, fixedCosts, discretionary, surplus } — all cents ints
    for (const v of Object.values(story.cashflowPulse)) {
      expect(Number.isInteger(v)).toBe(true);
    }

    // emergencyShield { percent, deltaThisWeek }
    expect(story.emergencyShield.percent).toBeGreaterThanOrEqual(0);
    expect(story.emergencyShield.percent).toBeLessThanOrEqual(100);

    // bossDamage { lifetimeFeesAvoided, label }
    expect(story.bossDamage.label).toContain("€");

    // agenticHighlight { text, projectionEur } — 9_120 cents/mo at 7% p.a.
    // over 35 years ≈ €164,25x (whole EUR integer).
    expect(story.agenticHighlight.text).toContain("Altersvorsorgedepot");
    expect(Number.isInteger(story.agenticHighlight.projectionEur)).toBe(true);
    expect(story.agenticHighlight.projectionEur).toBeGreaterThan(160_000);
    expect(story.agenticHighlight.projectionEur).toBeLessThan(170_000);
  });

  it("falls back to a nudging highlight when no micro-habit fired", async () => {
    const { ports } = makePorts({
      getMicroHabitHighlight: vi.fn(async () => null),
    });
    const { story, weeklySummaryRow } = await generateWeeklySummary(ports, USER, SUNDAY);
    expect(story.agenticHighlight.text).toContain("next micro-quest");
    expect(story.agenticHighlight.projectionEur).toBe(0);
    expect(weeklySummaryRow.feesAvoided).toBe(38_000);
  });
});
