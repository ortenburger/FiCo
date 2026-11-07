/**
 * Skill-tree quest/badge tracking (Topic 4) — GAMIFICATION.md §6.
 *
 * Pure quest-graph logic on top of the §6 config: prerequisite gating,
 * per-quest dedupe ("duplicate event" can never double-award because a
 * completed quest blocks its taskTag forever), and title evaluation.
 *
 * Integration point — Topic 1 engine: run `engine.emit(userId, questEvent)`
 * with the quests layer. The quest layer passes `meta.xp` so the engine's
 * event XP table never overrides quest XP (see engine.resolveXp). The
 * `QuestTracker` optionally takes the engine/tier below so the same call
 * also credits XP + levels; without a tier it stays a pure state machine
 * and callers award XP themselves.
 */
import {
  LEVEL_TITLE_REQUIREMENTS,
  QUEST_BY_ID,
  QUEST_BY_TASK_TAG,
  QUESTS,
  type LevelTitleRequirement,
  type QuestDef,
} from "./quests-config.js";
import type { FicoEvent } from "./types.js";

/** Deterministic tier for the completion state of one user. */
export interface QuestProgressStore {
  /** Completed quest ids (e.g. from the profile/quest-aspect rows). */
  loadCompleted(userId: string): Promise<ReadonlySet<string>>;
  markCompleted(userId: string, questId: string): Promise<void>;
}

/** Optional XP tier that mirrors the Topic 1 GamificationEngine surface. */
export interface QuestXpAwarder {
  emit(userId: string, event: FicoEvent): Promise<{ xpGained: number }>;
}

export interface QuestEventContext {
  userId: string;
}

/** Accepts a bare userId or a context object — call sites use both. */
type QuestEventSubject = string | QuestEventContext;

function subjectUserId(ctx: QuestEventSubject): string {
  return typeof ctx === "string" ? ctx : ctx.userId;
}

export interface CompletedQuestInfo {
  questId: string;
  title: string;
  chapter: QuestDef["chapter"];
  xp: number;
  taskTag: string;
}

export interface UnlockedTitle {
  level: number;
  title: string;
}

export interface QuestResult {
  /** Quests this event completed (empty for gated, unknown or replayed events). */
  questsCompleted: CompletedQuestInfo[];
  /** Quests whose prerequisites were NOT completable before, but now are. */
  newlyAvailableQuestIds: string[];
  /** XP due from newly completed quests (actual XP when a tier is wired in). */
  xpGained: number;
  /** Titles earned by this event per the §6 titles table. */
  titlesUnlocked: UnlockedTitle[];
}

const EMPTY_RESULT: QuestResult = {
  questsCompleted: [],
  newlyAvailableQuestIds: [],
  xpGained: 0,
  titlesUnlocked: [],
};

/** Quests completable given a completed set: prereqs met, not completed yet. */
export function availableQuestIds(completed: ReadonlySet<string>): string[] {
  return QUESTS.filter(
    (quest) =>
      !completed.has(quest.id) && quest.prerequisiteQuestIds.every((id) => completed.has(id)),
  ).map((quest) => quest.id);
}

/** Whether each title row of the §6 table is satisfied by completed quests. */
export function evaluateTitles(completed: ReadonlySet<string>): UnlockedTitle[] {
  return LEVEL_TITLE_REQUIREMENTS.flatMap((req: LevelTitleRequirement) =>
    req.questIds.every((id) => completed.has(id)) ? [{ level: req.level, title: req.title }] : [],
  );
}

/** Full §6 tree projection for a profile — API/profile + skill-tree map helper. */
export function deriveQuestState(completed: ReadonlySet<string>): Array<{
  quest: QuestDef;
  status: "completed" | "available" | "locked";
}> {
  return QUESTS.map((quest) => ({
    quest,
    status: completed.has(quest.id)
      ? ("completed" as const)
      : quest.prerequisiteQuestIds.every((id) => completed.has(id))
        ? ("available" as const)
        : ("locked" as const),
  }));
}

export class QuestTracker {
  private readonly store: QuestProgressStore;
  private readonly tier: QuestXpAwarder | null;

  constructor(store: QuestProgressStore = new InMemoryQuestStore(), tier: QuestXpAwarder | null = null) {
    this.store = store;
    this.tier = tier;
  }

  /**
   * Feeds one `FicoEvent` into the tree and returns what changed: quests
   * completed (with XP award-data), quests that just became completable and
   * titles unlocked. Unknown taskTags, missing prerequisites and already
   * completed quests are silently ignored — no XP escapes on those paths.
   */
  async onEvent(ctx: QuestEventSubject, event: FicoEvent): Promise<QuestResult> {
    const userId = subjectUserId(ctx);
    const quest = QUEST_BY_TASK_TAG.get(event.type);
    if (!quest) return EMPTY_RESULT;

    const completed = new Set(await this.store.loadCompleted(userId));
    if (completed.has(quest.id)) return EMPTY_RESULT; // dedupe: no double XP
    if (!quest.prerequisiteQuestIds.every((id) => completed.has(id))) {
      return EMPTY_RESULT; // out of order: prerequisite missing
    }

    const beforeAvailable = new Set(availableQuestIds(completed));

    completed.add(quest.id);
    await this.store.markCompleted(userId, quest.id);

    const questsCompleted: CompletedQuestInfo[] = [
      {
        questId: quest.id,
        title: quest.title,
        chapter: quest.chapter,
        xp: quest.xp,
        taskTag: quest.taskTag,
      },
    ];

    const afterAvailable = availableQuestIds(completed);
    const newlyAvailableQuestIds = afterAvailable.filter(
      (id) => !beforeAvailable.has(id),
    );

    const afterTitles = evaluateTitles(completed);
    const beforeTitleLevels = new Set(
      // titles on the pre-completion state — recompute without the new quest
      evaluateTitles(
        new Set([...completed].filter((id) => id !== quest.id)),
      ).map((t) => t.level),
    );
    const titlesUnlocked = afterTitles.filter((t) => !beforeTitleLevels.has(t.level));

    // Cross-tier XP handoff: the quest layer decides that a completion awards
    // quest.xp and lets the Topic 1 engine journal it (meta.xp wins over
    // engine tables). Idempotency for the same eventId stays engine-owned.
    let xpGained: number;
    if (this.tier) {
      const award = await this.tier.emit(userId, {
        type: event.type,
        subjectId: quest.id,
        eventId: event.eventId,
        meta: { questId: quest.id, xp: quest.xp, ...(event.meta ?? {}) },
      });
      xpGained = award.xpGained;
    } else {
      xpGained = quest.xp; // pure mode: XP award data returned unjournaled
    }

    return { questsCompleted, newlyAvailableQuestIds, xpGained, titlesUnlocked };
  }

  /** Quest ids completable right now for a user. */
  async getAvailableQuestIds(userId: string): Promise<string[]> {
    return availableQuestIds(await this.store.loadCompleted(userId));
  }

  /** Titles currently earned by a user. */
  async getEarnedTitles(userId: string): Promise<UnlockedTitle[]> {
    return evaluateTitles(await this.store.loadCompleted(userId));
  }
}

/**
 * In-memory fake store for tests / offline demos (GAMIFICATION_BRIEF.md
 * Topic 4). Not persisted — swap in a Prisma adapter when Topic 1 lands the
 * quest aspect seating.
 */
export class InMemoryQuestStore implements QuestProgressStore {
  private readonly completedByUser = new Map<string, Set<string>>();

  async loadCompleted(userId: string): Promise<ReadonlySet<string>> {
    return this.completedByUser.get(userId) ?? new Set<string>();
  }

  async markCompleted(userId: string, questId: string): Promise<void> {
    let set = this.completedByUser.get(userId);
    if (!set) {
      set = new Set<string>();
      this.completedByUser.set(userId, set);
    }
    set.add(questId);
  }
}

/** Convenience: taskTag → §6 quest lookup used by API route validation. */
export { QUEST_BY_TASK_TAG as QUEST_TASK_TAG_INDEX };
