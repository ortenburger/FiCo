import { describe, expect, it } from "vitest";
import {
  CancellationLockedError,
  generateCancellationLetterOrThrow,
  unlockCancellation,
} from "./underwriting-chasm.js";

describe("Underwriting Chasm guard", () => {
  it("blocks cancellation letters before POLICY_ISSUED unlock", () => {
    expect(() =>
      generateCancellationLetterOrThrow("UNDERWRITING"),
    ).toThrow(CancellationLockedError);

    expect(() =>
      generateCancellationLetterOrThrow("APPLICATION_SUBMITTED"),
    ).toThrow(CancellationLockedError);
  });

  it("requires cryptographic issue confirmation before unlock", () => {
    expect(() =>
      unlockCancellation({
        status: "POLICY_ISSUED",
        issuedConfirmationHash: "short",
      }),
    ).toThrow(/issuedConfirmationHash/);

    const next = unlockCancellation({
      status: "POLICY_ISSUED",
      issuedConfirmationHash: "a".repeat(64),
    });
    expect(next).toBe("CANCELLATION_ALLOWED");
    expect(generateCancellationLetterOrThrow(next).allowed).toBe(true);
  });
});
