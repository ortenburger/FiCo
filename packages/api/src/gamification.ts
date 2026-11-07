import type { FastifyInstance } from "fastify";
import { prisma } from "@fico/db";
import {
  DEFAULT_SNACKS,
  GamificationEngine,
  PrismaStore,
  XP_PER_WRONG_ANSWER,
  checkIn,
  completeSnack,
  evaluateQuizAnswer,
  type FinancialSnack,
  type GamificationProfileData,
} from "@fico/gamification";
import { z } from "zod";

/**
 * /api/gamification/* — thin HTTP layer over @fico/gamification.
 * All rules (streak, XP, levels, quiz scoring) live in the package; this file
 * only loads/saves through the Prisma store and maps to the hub's DTOs.
 */

const store = new PrismaStore(prisma);
const engine = new GamificationEngine(store);

const userIdQuery = z.object({ userId: z.string().uuid() });

function newProfile(userId: string): GamificationProfileData {
  return {
    userId,
    currentStreakWeeks: 0,
    longestStreakWeeks: 0,
    lastCheckInDate: null,
    streakFreezeCount: 1,
    totalXp: 0,
    currentLevel: 1,
    completedSnacks: [],
    badges: [],
  };
}

async function loadOrCreate(userId: string): Promise<GamificationProfileData> {
  return (await store.loadProfile(userId)) ?? (await store.saveProfile(userId, newProfile(userId)));
}

/** Hub DTO: never expose which option is correct before the user answers. */
function toSnackDto(snack: FinancialSnack, index: number) {
  return {
    id: snack.id,
    slug: snack.slug,
    category: snack.category,
    number: index + 1,
    title: snack.heroLine,
    bite: snack.steps.map((step) => step.body),
    question: snack.quiz.question,
    options: snack.quiz.options.map((option, optionIndex) => ({
      id: `opt-${optionIndex}`,
      text: option.label,
    })),
    xpReward: snack.xpReward,
    wrongXpPenalty: Math.abs(XP_PER_WRONG_ANSWER),
  };
}

export function registerGamificationRoutes(app: FastifyInstance) {
  app.get("/api/gamification/profile", async (req, reply) => {
    const parsed = userIdQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "userId (uuid) required" });
    try {
      await loadOrCreate(parsed.data.userId);
      return await engine.getProfile(parsed.data.userId);
    } catch (error) {
      req.log.warn({ err: error }, "gamification profile failed");
      return reply.code(404).send({ error: "Unknown user" });
    }
  });

  app.get("/api/gamification/snacks", async () =>
    DEFAULT_SNACKS.map((snack, index) => toSnackDto(snack, index)),
  );

  app.get("/api/gamification/wrapped/latest", async (req, reply) => {
    const parsed = userIdQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "userId (uuid) required" });
    try {
      const latest = await prisma.weeklySummary.findFirst({
        where: { userId: parsed.data.userId },
        orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
      });
      if (!latest) return reply.code(404).send({ error: "No weekly summary yet" });
      const story =
        typeof latest.microHabitStory === "object" && latest.microHabitStory !== null
          ? (latest.microHabitStory as Record<string, unknown>)
          : {};
      return {
        weekNumber: latest.weekNumber,
        year: latest.year,
        xpEarned: latest.xpEarned,
        ...story,
      };
    } catch (error) {
      req.log.warn({ err: error }, "gamification wrapped failed");
      return reply.code(404).send({ error: "Wrapped unavailable" });
    }
  });

  app.post("/api/gamification/quests/complete", async (req, reply) => {
    const parsed = z
      .object({
        userId: z.string().uuid(),
        questId: z.string().min(1),
        xp: z.number().int().positive().default(100),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quest payload" });
    const { userId, questId, xp } = parsed.data;
    try {
      await loadOrCreate(userId);
      const award = await engine.emit(userId, {
        type: "QUEST_COMPLETED",
        eventId: `quest:${userId}:${questId}`,
        meta: { xp, questId },
      });
      const updated = await engine.getProfile(userId);
      return {
        xpGained: award.xpGained,
        levelUp: award.levelUp,
        badgesEarned: award.badgesEarned,
        profile: updated,
      };
    } catch (error) {
      req.log.warn({ err: error }, "gamification quest complete failed");
      return reply.code(404).send({ error: "Quest completion failed" });
    }
  });

  app.post("/api/gamification/check-in", async (req, reply) => {
    const parsed = userIdQuery.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "userId (uuid) required" });
    const { userId } = parsed.data;
    try {
      const profile = await loadOrCreate(userId);
      const result = checkIn(profile, new Date());
      // Persist streak state first; engine.emit then adds XP on top of it.
      await store.saveProfile(userId, result.profile);
      let xpGained = 0;
      if (result.award.xpGained > 0) {
        const award = await engine.emit(userId, {
          type: "CHECK_IN",
          eventId: `checkin:${userId}:${result.profile.lastCheckInDate?.toISOString().slice(0, 10)}`,
          meta: { xp: result.award.xpGained },
        });
        xpGained = award.xpGained;
      }
      return {
        xpGained,
        currentStreakWeeks: result.profile.currentStreakWeeks,
        freezeUsed: result.award.freezeUsed,
        streakReset: result.award.streakReset,
        flameTier: result.tier,
      };
    } catch (error) {
      req.log.warn({ err: error }, "gamification check-in failed");
      return reply.code(404).send({ error: "Check-in failed" });
    }
  });

  app.post("/api/gamification/snacks/answer", async (req, reply) => {
    const parsed = z
      .object({
        userId: z.string().uuid(),
        snackSlug: z.string().min(1),
        optionId: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid answer payload" });

    const { userId, snackSlug, optionId } = parsed.data;
    const snack = DEFAULT_SNACKS.find((candidate) => candidate.slug === snackSlug);
    if (!snack) return reply.code(404).send({ error: "Unknown snack" });

    const letterMap: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
    const answerIndex = optionId.startsWith("opt-")
      ? Number(optionId.slice(4))
      : (letterMap[optionId.toLowerCase()] ?? -1);
    if (!Number.isInteger(answerIndex) || answerIndex < 0) {
      return reply.code(400).send({ error: "Invalid optionId" });
    }
    const evaluation = evaluateQuizAnswer(snack, answerIndex);
    const correctIndex = snack.quiz.options.findIndex((option) => option.isCorrect);
    const correctOptionId = correctIndex >= 0 ? `opt-${correctIndex}` : null;

    try {
      const profile = await loadOrCreate(userId);
      const alreadyDone = profile.completedSnacks.includes(snack.id);

      // A correct answer pays out once per snack; a wrong one always costs XP.
      if (evaluation.correct && alreadyDone) {
        return { correct: true, xpGained: 0, correctOptionId };
      }
      if (evaluation.correct) {
        await store.saveProfile(userId, {
          ...profile,
          completedSnacks: completeSnack(profile.completedSnacks, snack.id),
        });
      }
      const award = await engine.emit(userId, {
        type: evaluation.correct ? "SNACK_CORRECT" : "SNACK_WRONG",
        eventId: evaluation.correct ? `snack:${userId}:${snack.id}` : undefined,
        meta: { xp: evaluation.xpDelta, snackId: snack.id },
      });
      return { correct: evaluation.correct, xpGained: award.xpGained, correctOptionId };
    } catch (error) {
      req.log.warn({ err: error }, "gamification snack answer failed");
      return reply.code(404).send({ error: "Answer failed" });
    }
  });
}
