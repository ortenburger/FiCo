import type { FastifyInstance } from "fastify";
import { prisma } from "@fico/db";
import { z } from "zod";
import {
  PRESIGN_TTL_SECONDS,
  buildObjectKey,
  presignPutObject,
  readS3Env,
  type S3Env,
} from "./s3.js";

const presignBody = z.object({
  userId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128).optional(),
});

const completeBody = z.object({
  userId: z.string().uuid(),
  s3Key: z.string().min(1).max(512),
});

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/documents/presign", async (req, reply) => {
    let s3: S3Env;
    try {
      s3 = readS3Env();
    } catch (err) {
      const message = err instanceof Error ? err.message : "S3 not configured";
      return reply.code(503).send({ error: message });
    }

    const body = presignBody.parse(req.body);
    const contentType = body.contentType ?? "application/octet-stream";

    const policy = await prisma.insurancePolicy.findFirst({
      where: { userId: body.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!policy) {
      return reply.code(404).send({
        error: "No insurance policy found for this user",
        userId: body.userId,
      });
    }

    const s3Key = buildObjectKey(body.userId, policy.id, body.fileName);
    const uploadUrl = presignPutObject({
      env: s3,
      objectKey: s3Key,
      contentType,
    });

    return {
      uploadUrl,
      s3Key,
      policyId: policy.id,
      contentType,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  });

  app.post("/v1/documents/complete", async (req, reply) => {
    const body = completeBody.parse(req.body);

    const policy = await prisma.insurancePolicy.findFirst({
      where: { userId: body.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, rawDocumentS3Key: true },
    });

    if (!policy) {
      return reply.code(404).send({
        error: "No insurance policy found for this user",
        userId: body.userId,
      });
    }

    const expectedPrefix = `users/${body.userId}/policies/${policy.id}/`;
    if (!body.s3Key.startsWith(expectedPrefix)) {
      return reply.code(400).send({
        error: "s3Key does not match the user's policy upload namespace",
        expectedPrefix,
      });
    }

    const updated = await prisma.insurancePolicy.update({
      where: { id: policy.id },
      data: {
        rawDocumentS3Key: body.s3Key,
        documentStatus: "UPLOADED",
      },
      select: { id: true, rawDocumentS3Key: true, documentStatus: true },
    });

    return {
      policyId: updated.id,
      rawDocumentS3Key: updated.rawDocumentS3Key,
      documentStatus: updated.documentStatus,
    };
  });
}
