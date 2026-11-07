/**
 * AISP webhook HMAC-SHA256 verification.
 * Never process payloads that fail signature checks.
 */
export declare function signWebhookPayload(secret: string, rawBody: string | Buffer): string;
export declare function verifyWebhookSignature(params: {
    secret: string;
    rawBody: string | Buffer;
    signatureHeader: string;
}): boolean;
//# sourceMappingURL=hmac.d.ts.map