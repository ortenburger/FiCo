/**
 * Skill-tree quest configuration — GAMIFICATION.md §6 (chapter tree) and the
 * Character Titles / Badges table.
 *
 * Pure data on purpose: importing this module pulls in no engine or store
 * code so the tree can be embedded by the API docs (Topic 7), the frontend
 * skill-tree map (Topic 8) and seed/demo data (Topic 10) without wiring up
 * the engine.
 */

export type QuestChapterId = "foundation" | "fee-slayer" | "wealth-engine";

export interface QuestChapterDef {
  id: QuestChapterId;
  /** Display label per the §6 tree. */
  label: string;
  /** Quest ids in their required completion order. */
  questIds: readonly string[];
}

export interface QuestDef {
  /**
   * Tree position id, `<chapter>.<position>` (1.1–3.3). String on purpose —
   * the §6 tree names quests by these numbers.
   */
  id: string;
  chapter: QuestChapterId;
  /** 1-based position inside the chapter. */
  orderInChapter: number;
  title: string;
  icon: string;
  /** XP awarded on completion (§6: 50–500). */
  xp: number;
  /**
   * taskTag: the `FicoEvent.type` whose arrival completes this quest.
   * Emit as `{ type: taskTag, meta: { xp }, meta: {...} }` from producers.
   */
  taskTag: string;
  /**
   * Quest ids that must be completed first. Chapter gate = last quest of the
   * previous chapter; per-chapter order = previous quest of the same chapter.
   * Chains are transitive, so one id per entry keeps this minimal.
   */
  prerequisiteQuestIds: readonly string[];
}

export const QUEST_CHAPTERS: readonly QuestChapterDef[] = [
  {
    id: "foundation",
    label: "Chapter 1: The Foundation",
    questIds: ["1.1", "1.2", "1.3"],
  },
  {
    id: "fee-slayer",
    label: "Chapter 2: The Fee Slayer",
    questIds: ["2.1", "2.2", "2.3"],
  },
  {
    id: "wealth-engine",
    label: "Chapter 3: The Wealth Engine",
    questIds: ["3.1", "3.2", "3.3"],
  },
] as const;

export const QUESTS: readonly QuestDef[] = [
  {
    id: "1.1",
    chapter: "foundation",
    orderInChapter: 1,
    title: "Connect Bank (AISP)",
    icon: "🛡️",
    xp: 50,
    taskTag: "bank.connected",
    prerequisiteQuestIds: [],
  },
  {
    id: "1.2",
    chapter: "foundation",
    orderInChapter: 2,
    title: "Categorize Fixed Costs",
    icon: "📊",
    xp: 75,
    taskTag: "costs.categorized",
    prerequisiteQuestIds: ["1.1"],
  },
  {
    id: "1.3",
    chapter: "foundation",
    orderInChapter: 3,
    title: "Build The Shield (Emergency)",
    icon: "🏰",
    xp: 150,
    taskTag: "shield.funded",
    prerequisiteQuestIds: ["1.2"],
  },
  {
    id: "2.1",
    chapter: "fee-slayer",
    orderInChapter: 1,
    title: "Scan 1st Legacy Policy",
    icon: "📄",
    xp: 100,
    taskTag: "policy.scanned",
    prerequisiteQuestIds: ["1.3"], // chapter gate (implies the whole 1.x chain)
  },
  {
    id: "2.2",
    chapter: "fee-slayer",
    orderInChapter: 2,
    title: 'Defeat "Zillmerung Monster"',
    icon: "🥊",
    xp: 200,
    taskTag: "zillmerung.defeated",
    prerequisiteQuestIds: ["2.1"],
  },
  {
    id: "2.3",
    chapter: "fee-slayer",
    orderInChapter: 3,
    title: "Net-Tariff Switch Check",
    icon: "⚖️",
    xp: 250,
    taskTag: "tariff.switched",
    prerequisiteQuestIds: ["2.2"],
  },
  {
    id: "3.1",
    chapter: "wealth-engine",
    orderInChapter: 1,
    title: "Open Altersvorsorgedepot",
    icon: "🚀",
    xp: 300,
    taskTag: "depot.opened",
    prerequisiteQuestIds: ["2.3"], // chapter gate
  },
  {
    id: "3.2",
    chapter: "wealth-engine",
    orderInChapter: 2,
    title: "First Automated Sweep",
    icon: "🔄",
    xp: 200,
    taskTag: "sweep.created",
    prerequisiteQuestIds: ["3.1"],
  },
  {
    id: "3.3",
    chapter: "wealth-engine",
    orderInChapter: 3,
    title: "Financial Sovereignty",
    icon: "👑",
    xp: 500,
    taskTag: "sovereignty.reached",
    prerequisiteQuestIds: ["3.2"],
  },
] as const;

/** All valid taskTags of the tree, in chapter-then-order completion sequence. */
export const QUEST_EVENT_PATH: readonly string[] = QUESTS.map((q) => q.taskTag);

/** Quest id → quest. */
export const QUEST_BY_ID: ReadonlyMap<string, QuestDef> = new Map(
  QUESTS.map((quest) => [quest.id, quest]),
);

/** taskTag → quest. Assumption: every taskTag completes at most one quest. */
export const QUEST_BY_TASK_TAG = new Map(QUESTS.map((quest) => [quest.taskTag, quest]));

export interface LevelTitleRequirement {
  level: number;
  title: string;
  /** Quest ids that, once completed, satisfy the §6 titles table row. */
  questIds: readonly string[];
}

/**
 * Titles Lv 1–7 evaluated from quest completion state (§6 titles table).
 * Notes on the mapping, since the tree has no dedicated debt quest:
 * - Lv 3 "Debt Crusher" ↔ 2.2 (slaying the Zillmerung monster = the
 *   high-interest / hidden-commission debt monster of Chapter 2).
 * - Lv 5 needs a *depot with automated sweep*, so both 3.1 and 3.2.
 */
export const LEVEL_TITLE_REQUIREMENTS: readonly LevelTitleRequirement[] = [
  { level: 1, title: "Budget Novice", questIds: ["1.1"] }, // AISP connect
  { level: 2, title: "Shield Bearer", questIds: ["1.3"] }, // fixed costs in reserve
  { level: 3, title: "Debt Crusher", questIds: ["2.2"] }, // Zillmerung defeated
  { level: 4, title: "Fee Slayer", questIds: ["2.1"] }, // 1 legacy contract unmasked
  { level: 5, title: "Depot Pioneer", questIds: ["3.1", "3.2"] }, // depot + running sweep
  { level: 6, title: "Net-Tariff Ninja", questIds: ["2.3"] }, // net tariff converted
  { level: 7, title: "Financial Sovereign", questIds: ["3.3"] }, // cashflow in equilibrium
] as const;
