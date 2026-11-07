import { createHmac, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@fico/db";
import { z } from "zod";

const PRESIGN_TTL_SECONDS = 900;

type S3Env = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

function readS3Env(): S3Env {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION ?? "eu-central-1";
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new Error(
      "Missing S3 config: set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET",
    );
  }
  return { endpoint, accessKey, secretKey, bucket, region };
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  return hmacSha256(kService, "aws4_request");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "document";
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
  return safe.length > 0 ? safe : "document";
}

/**
 * Path-style presigned PUT URL (MinIO / S3-compatible).
 */
export function presignPutObject(params: {
  env: S3Env;
  objectKey: string;
  contentType: string;
  expiresIn?: number;
}): string {
  const expiresIn = params.expiresIn ?? PRESIGN_TTL_SECONDS;
  const endpointUrl = new URL(params.env.endpoint);
  const host = endpointUrl.host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${params.env.region}/s3/aws4_request`;
  const credential = `${params.env.accessKey}/${credentialScope}`;

  const canonicalUri = `/${encodeRfc3986(params.env.bucket)}/${params.objectKey
    .split("/")
    .map(encodeRfc3986)
    .join("/")}`;

  const signedHeaders = "content-type;host";
  const canonicalHeaders =
    `content-type:${params.contentType}\n` + `host:${host}\n`;

  const queryEntries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];

  const canonicalQueryString = queryEntries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(params.env.secretKey, dateStamp, params.env.region),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  const signedQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `${params.env.endpoint}${canonicalUri}?${signedQuery}`;
}

function buildObjectKey(userId: string, policyId: string, fileName: string): string {
  return `users/${userId}/policies/${policyId}/${sanitizeFileName(fileName)}`;
}

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
