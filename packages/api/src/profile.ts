import type { FastifyInstance } from "fastify";
import { MaritalStatus, Prisma, prisma } from "@fico/db";
import { z } from "zod";

const maritalStatusSchema = z.nativeEnum(MaritalStatus);

/**
 * Partial profile update.
 *
 * The ElevenLabs client tool sets one field per call (e.g. only the salary
 * during intake), so every profile attribute except the user id is optional.
 * Omitted attributes are left untouched in the database.
 */
const profileBodySchema = z.object({
  userId: z.string().uuid(),
  grossMonthlyIncome: z.union([z.string(), z.number()]).optional(),
  maritalStatus: maritalStatusSchema.optional(),
});

const profileQuerySchema = z.object({
  userId: z.string().uuid(),
});

function serializeProfile(profile: {
  userId: string;
  grossMonthlyIncome: Prisma.Decimal;
  maritalStatus: MaritalStatus;
  updatedAt: Date;
}) {
  return {
    userId: profile.userId,
    grossMonthlyIncome: profile.grossMonthlyIncome.toString(),
    maritalStatus: profile.maritalStatus,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

async function assertUserExists(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return user !== null;
}

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/profile", async (req, reply) => {
    const q = profileQuerySchema.parse(req.query);
    if (!(await assertUserExists(q.userId))) {
      return reply.code(404).send({ error: "User not found" });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: q.userId },
    });
    if (!profile) {
      return reply.code(404).send({ error: "Profile not found" });
    }

    return serializeProfile(profile);
  });

  app.put("/v1/profile", async (req, reply) => {
    const body = profileBodySchema.parse(req.body);
    if (!(await assertUserExists(body.userId))) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (body.grossMonthlyIncome === undefined && body.maritalStatus === undefined) {
      return reply
        .code(400)
        .send({ error: "No profile attribute given. Provide grossMonthlyIncome and/or maritalStatus." });
    }

    const grossMonthlyIncome =
      body.grossMonthlyIncome === undefined
        ? undefined
        : new Prisma.Decimal(body.grossMonthlyIncome);

    const existing = await prisma.userProfile.findUnique({
      where: { userId: body.userId },
      select: { userId: true, grossMonthlyIncome: true, maritalStatus: true },
    });

    // Partial update: keep the stored value for every attribute the caller omitted.
    const profile = existing
      ? await prisma.userProfile.update({
          where: { userId: body.userId },
          data: {
            ...(grossMonthlyIncome === undefined
              ? {}
              : { grossMonthlyIncome }),
            ...(body.maritalStatus === undefined
              ? {}
              : { maritalStatus: body.maritalStatus }),
          },
        })
      : await prisma.userProfile.create({
          data: {
            userId: body.userId,
            grossMonthlyIncome: grossMonthlyIncome ?? new Prisma.Decimal(0),
            maritalStatus: body.maritalStatus ?? MaritalStatus.SINGLE,
          },
        });

    return serializeProfile(profile);
  });
}
