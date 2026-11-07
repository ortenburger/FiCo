import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * AISP webhook HMAC-SHA256 verification.
 * Never process payloads that fail signature checks.
 */
export function signWebhookPayload(
  secret: string,
  rawBody: string | Buffer,
): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(params: {
  secret: string;
  rawBody: string | Buffer;
  signatureHeader: string;
}): boolean {
  const expected = signWebhookPayload(params.secret, params.rawBody);
  const provided = params.signatureHeader
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
