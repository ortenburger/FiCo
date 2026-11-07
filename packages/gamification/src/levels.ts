/**
 * Level ladder per GAMIFICATION.md §6 — seven levels, Budget Novice →
 * Financial Sovereign. Levels track XP cumulatively; XP is never lost below
 * the level floor (a negative snack answer can zero XP but not demote — see
 * engine floor at 0).
 */

export const MAX_LEVEL = 7;

/** Index 0 → Lv 1, index 6 → Lv 7. */
export const LEVEL_TITLES: readonly string[] = [
  "Budget Novice",
  "Shield Bearer",
  "Debt Crusher",
  "Fee Slayer",
  "Depot Pioneer",
  "Net-Tariff Ninja",
  "Financial Sovereign",
] as const;

/**
 * Cumulative XP required to REACH level n.
 * Chapters of the skill tree (§6) map onto these floors:
 * Chapter 1 ends at Lv 2, Chapter 2 at Lv 4, Chapter 3 at Lv 7.
 */
const LEVEL_XP_FLOORS: readonly number[] = [0, 300, 800, 1600, 2800, 4500, 7000] as const;

/** XP required to reach level `level` (clamped to [1, MAX_LEVEL]). */
export function xpForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(Math.floor(level), MAX_LEVEL));
  return LEVEL_XP_FLOORS[clamped - 1] ?? 0;
}

/** Highest level whose XP floor is met, capped at MAX_LEVEL. */
export function levelForXp(xp: number): number {
  for (let level = MAX_LEVEL; level >= 2; level -= 1) {
    if (xp >= (LEVEL_XP_FLOORS[level - 1] ?? 0)) return level;
  }
  return 1;
}

/** Title for a level, clamped to the known 1..MAX_LEVEL range. */
export function levelTitle(level: number): string {
  const clamped = Math.max(1, Math.min(Math.floor(level), MAX_LEVEL));
  return LEVEL_TITLES[clamped - 1] ?? "Budget Novice";
}
