import { createHash, createHmac } from "node:crypto";

export const PRESIGN_TTL_SECONDS = 900;

export type S3Env = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

export function readS3Env(): S3Env {
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

function encodeObjectKey(objectKey: string): string {
  return objectKey.split("/").map(encodeRfc3986).join("/");
}

function canonicalObjectUri(bucket: string, objectKey: string): string {
  return `/${encodeRfc3986(bucket)}/${encodeObjectKey(objectKey)}`;
}

/**
 * Path-style presigned URL (MinIO / S3-compatible).
 *
 * PUT signs content-type so the browser can send exactly one content type;
 * GET signs only the host header.
 */
function presignUrl(params: {
  method: "GET" | "PUT";
  env: S3Env;
  objectKey: string;
  expiresIn?: number;
  contentType?: string;
}): string {
  const expiresIn = params.expiresIn ?? PRESIGN_TTL_SECONDS;
  const endpointUrl = new URL(params.env.endpoint);
  const host = endpointUrl.host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${params.env.region}/s3/aws4_request`;
  const credential = `${params.env.accessKey}/${credentialScope}`;

  const canonicalUri = canonicalObjectUri(params.env.bucket, params.objectKey);

  const signedHeaders =
    params.method === "PUT" ? "content-type;host" : "host";
  const canonicalHeaders =
    params.method === "PUT"
      ? `content-type:${params.contentType ?? "application/octet-stream"}\nhost:${host}\n`
      : `host:${host}\n`;

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
    params.method,
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

export function presignPutObject(params: {
  env: S3Env;
  objectKey: string;
  contentType: string;
  expiresIn?: number;
}): string {
  return presignUrl({ ...params, method: "PUT" });
}

export function presignGetObject(params: {
  env: S3Env;
  objectKey: string;
  expiresIn?: number;
}): string {
  return presignUrl({ ...params, method: "GET" });
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "document";
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
  return safe.length > 0 ? safe : "document";
}

export function buildObjectKey(
  userId: string,
  policyId: string,
  fileName: string,
): string {
  return `users/${userId}/policies/${policyId}/${sanitizeFileName(fileName)}`;
}

/** The original upload name is the last path segment of the object key. */
export function fileNameFromObjectKey(objectKey: string): string {
  const segments = objectKey.split("/");
  return decodeURIComponent(segments[segments.length - 1] ?? "document");
}
