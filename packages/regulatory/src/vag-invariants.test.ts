import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertAllowedFeeType,
  FORBIDDEN_KICKBACK_ENTITIES,
  isForbiddenKickbackEntity,
} from "./vag-invariants.js";

// src/ → ../../db → packages/db
const dbPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "../../db");

describe("§ 48b VAG kickback invariant", () => {
  it("rejects forbidden fee types", () => {
    expect(() => assertAllowedFeeType("KICKBACK")).toThrow(/48b VAG/);
    expect(() => assertAllowedFeeType("ADVISORY_FEE")).not.toThrow();
  });

  it("schema contains no kickback ledger tables", () => {
    const schema = readFileSync(
      join(dbPackageRoot, "prisma/schema.prisma"),
      "utf8",
    );
    const sql = readFileSync(
      join(
        dbPackageRoot,
        "prisma/migrations/20261107120000_init/migration.sql",
      ),
      "utf8",
    );
    for (const name of FORBIDDEN_KICKBACK_ENTITIES) {
      expect(isForbiddenKickbackEntity(name)).toBe(true);
      expect(schema.toLowerCase()).not.toContain(name);
      expect(sql.toLowerCase()).not.toContain(name);
    }
    expect(schema).toContain("AdvisoryFeeInvoice");
    expect(sql).toContain("advisory_fee_invoices");
  });
});
