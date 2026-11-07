import { createHash, createHmac } from "node:crypto";

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secret}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/** Path-style GET for MinIO / S3-compatible stores (see .env.example). */
export async function fetchS3Object(key: string): Promise<Buffer> {
  const endpoint = (process.env.S3_ENDPOINT ?? "http://localhost:9000").replace(
    /\/$/,
    "",
  );
  const bucket = process.env.S3_BUCKET ?? "fico-documents";
  const accessKey = process.env.S3_ACCESS_KEY ?? "";
  const secretKey = process.env.S3_SECRET_KEY ?? "";
  const region = process.env.S3_REGION ?? "eu-central-1";

  if (!key) throw new Error("rawDocumentS3Key is empty");
  if (!accessKey || !secretKey) {
    throw new Error("S3_ACCESS_KEY / S3_SECRET_KEY not configured");
  }

  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(`${endpoint}/${bucket}/${encodedKey}`);
  const host = url.host;
  const canonicalUri = url.pathname;

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256("");

  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "GET",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = hmacSha256(
    signingKey(secretKey, dateStamp, region, "s3"),
    stringToSign,
  ).toString("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3 GET ${res.status}: ${body.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}
