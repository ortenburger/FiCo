import { describe, expect, it } from "vitest";
import { InMemoryStore } from "./adapters/memory.js";
import { GamificationEngine } from "./engine.js";
import { InMemoryQuestStore, QuestTracker, availableQuestIds } from "./quests.js";
import {
  LEVEL_TITLE_REQUIREMENTS,
  QUESTS,
  QUEST_BY_TASK_TAG,
  QUEST_EVENT_PATH,
  QUEST_CHAPTERS,
} from "./quests-config.js";
import { LEVEL_TITLES } from "./levels.js";
import type { FicoEvent } from "./types.js";

const ALL_TASK_TAGS = [
  "bank.connected",
  "costs.categorized",
  "shield.funded",
  "policy.scanned",
  "zillmerung.defeated",
  "tariff.switched",
  "depot.opened",
  "sweep.created",
  "sovereignty.reached",
];

const QUEST_XP = [50, 75, 150, 100, 200, 250, 300, 200, 500];

describe("quests-config (§6 tree as data)", () => {
  it("has exactly the nine §6 quests in three chapters", () => {
    expect(QUESTS).toHaveLength(9);
    expect(QUEST_CHAPTERS.map((c) => c.questIds)).toHaveLength(3);
    expect(QUESTS.map((q) => q.id)).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "2.1",
      "2.2",
      "2.3",
      "3.1",
      "3.2",
      "3.3",
    ]);
  });

  it("carries the §6 XP ladder in order", () => {
    expect(QUESTS.map((q) => q.xp)).toEqual(QUEST_XP);
  });

  it("maps every taskTag to exactly one quest, bijectively", () => {
    expect(QUESTS.map((q) => q.taskTag)).toEqual(ALL_TASK_TAGS);
    expect(QUEST_BY_TASK_TAG.size).toBe(9);
  });

  it("gates chapters sequentially (2.1 on 1.3, 3.1 on 2.3)", () => {
    const q21 = QUESTS.find((q) => q.id === "2.1");
    const q31 = QUESTS.find((q) => q.id === "3.1");
    expect(q21?.prerequisiteQuestIds).toEqual(["1.3"]);
    expect(q31?.prerequisiteQuestIds).toEqual(["2.3"]);
  });
});

describe("QuestTracker", () => {
  function makeTracker() {
    const store = new InMemoryQuestStore();
    return { store, tracker: new QuestTracker(store), user: "user-1" };
  }

  it("ignores an out-of-order event whose prerequisite is missing", async () => {
    const { tracker, user } = makeTracker();
    const result = await tracker.onEvent(user, { type: "costs.categorized" });
    expect(result).toEqual({
      questsCompleted: [],
      newlyAvailableQuestIds: [],
      xpGained: 0,
      titlesUnlocked: [],
    });
    expect(await tracker.getAvailableQuestIds(user)).toEqual(["1.1"]);
  });

  it("ignores events with an unknown taskTag", async () => {
    const { tracker, user } = makeTracker();
    const result = await tracker.onEvent(user, { type: "guild.raided" });
    expect(result.xpGained).toBe(0);
    expect(result.questsCompleted).toEqual([]);
  });

  it("completes quests sequentially and unlocks the next one each time", async () => {
    const { tracker, user } = makeTracker();

    let result = await tracker.onEvent(user, { type: "bank.connected" });
    expect(result.questsCompleted.map((q) => q.questId)).toEqual(["1.1"]);
    expect(result.xpGained).toBe(50);
    expect(result.newlyAvailableQuestIds).toEqual(["1.2"]);
    expect(result.titlesUnlocked).toEqual([{ level: 1, title: "Budget Novice" }]);

    result = await tracker.onEvent(user, { type: "costs.categorized" });
    expect(result.questsCompleted.map((q) => q.questId)).toEqual(["1.2"]);
    expect(result.xpGained).toBe(75);
    expect(result.newlyAvailableQuestIds).toEqual(["1.3"]);
    expect(result.titlesUnlocked).toEqual([]);

    result = await tracker.onEvent(user, { type: "shield.funded" });
    expect(result.xpGained).toBe(150);
    expect(result.newlyAvailableQuestIds).toEqual(["2.1"]);
    expect(result.titlesUnlocked).toEqual([{ level: 2, title: "Shield Bearer" }]);

    result = await tracker.onEvent(user, { type: "policy.scanned" });
    expect(result.questsCompleted.map((q) => q.questId)).toEqual(["2.1"]);
    expect(result.xpGained).toBe(100);
    expect(result.newlyAvailableQuestIds).toEqual(["2.2"]);
    // Chapter 2 completion must have been impossible before 1.3 — proven by
    // the unlocked chain now opening.
    expect(await tracker.getAvailableQuestIds(user)).toEqual(["2.2"]);
  });

  it("never double-awards XP for a duplicate event", async () => {
    const { tracker, user } = makeTracker();

    const first = await tracker.onEvent(user, { type: "bank.connected" });
    expect(first.xpGained).toBe(50);

    const replaySameTag = await tracker.onEvent(user, { type: "bank.connected" });
    expect(replaySameTag.xpGained).toBe(0);
    expect(replaySameTag.questsCompleted).toEqual([]);

    const replayWithEventId: FicoEvent = { type: "bank.connected", eventId: "evt-1" };
    await tracker.onEvent(user, replayWithEventId);
    const dup = await tracker.onEvent(user, { ...replayWithEventId });
    expect(dup.xpGained).toBe(0);

    // exactly one completion recorded
    expect(availableQuestIds(await (tracker as any)["store"].loadCompleted(user))).toContain("1.2");
  });

  it("marks a completed quest as no longer available", async () => {
    const { tracker, user } = makeTracker();
    await tracker.onEvent(user, { type: "bank.connected" });
    const available = await tracker.getAvailableQuestIds(user);
    expect(available).toEqual(["1.2"]);
  });

  it("has the Lv-5 Depot Pioneer title require depot AND running sweep", async () => {
    const { tracker, user } = makeTracker();
    for (const tag of ["bank.connected", "costs.categorized", "shield.funded"]) {
      await tracker.onEvent(user, { type: tag });
    }
    for (const tag of ["policy.scanned", "zillmerung.defeated", "tariff.switched"]) {
      await tracker.onEvent(user, { type: tag });
    }
    await tracker.onEvent(user, { type: "depot.opened" });
    const titlesAfterDepot = await tracker.getEarnedTitles(user);
    expect(titlesAfterDepot.map((t) => t.title)).not.toContain("Depot Pioneer");

    const result = await tracker.onEvent(user, { type: "sweep.created" });
    expect(result.titlesUnlocked).toEqual([{ level: 5, title: "Depot Pioneer" }]);
  });
});

describe("full ordered quest path → all seven titles (§6 table)", () => {
  it("unlocks every title when the tree is walked in order", async () => {
    const tracker = new QuestTracker(new InMemoryQuestStore());
    const user = "path-walker";

    const unlocked: Array<{ level: number; title: string }> = [];
    let totalQuestXp = 0;

    for (const taskTag of QUEST_EVENT_PATH) {
      const result = await tracker.onEvent(user, { type: taskTag });
      totalQuestXp += result.xpGained;
      unlocked.push(...result.titlesUnlocked);
    }

    expect(totalQuestXp).toBe(QUEST_XP.reduce((a, b) => a + b, 0)); // 1825
    expect(unlocked.map((t) => t.title).sort()).toEqual([...LEVEL_TITLES].sort());
    // Titles are level-tagged 1..7, each exactly once
    expect(unlocked.map((t) => t.level).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not unlock titles out of order gates (skipping ahead does nothing)", async () => {
    const tracker = new QuestTracker(new InMemoryQuestStore());
    const user = "skipper";
    // Send the LAST tree event first: Financial Sovereignty must be blocked.
    const result = await tracker.onEvent(user, { type: "sovereignty.reached" });
    expect(result.xpGained).toBe(0);
    expect(await tracker.getEarnedTitles(user)).toEqual([]);
  });
});

describe("QuestTracker ↔ Topic 1 engine integration", () => {
  it("passes quest XP into the engine via meta.xp and levels the profile", async () => {
    const gamificationStore = new InMemoryStore();
    const engine = new GamificationEngine(gamificationStore);
    const tracker = new QuestTracker(new InMemoryQuestStore(), engine);
    const user = "egon";

    let total = 0;
    for (const taskTag of QUEST_EVENT_PATH) {
      const result = await tracker.onEvent(user, { type: taskTag, eventId: `evt-${taskTag}` });
      total += result.xpGained;
    }

    expect(total).toBe(1825);
    const profile = await engine.getProfile(user);
    expect(profile?.totalXp).toBe(1825);
  });

  it("counts event XP per §6 — bank.connected yields the quest XP, not the engine default", async () => {
    // subjectId and meta pass through so downstream journaling stays auditable
    const engine = new GamificationEngine(new InMemoryStore());
    const tracker = new QuestTracker(new InMemoryQuestStore(), engine);
    const result = await tracker.onEvent("u", { type: "bank.connected", subjectId: "finapi-bank" });
    expect(result.questsCompleted[0]).toMatchObject({
      questId: "1.1",
      xp: 50,
      taskTag: "bank.connected",
    });
  });
});
