/**
 * Loads the repository .env file into process.env.
 *
 * ES module imports are evaluated before the importing module's body, so this
 * has to run as a side-effect import *before* @fico/db is pulled in — Prisma
 * reads DATABASE_URL when the client is constructed.
 *
 * Existing shell environment variables win: loadEnvFile never overwrites a
 * variable that is already set.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// packages/api/src/ -> repo root
const candidates = [
  resolve(here, "../../../.env"),
  resolve(here, "../../.env"),
  resolve(process.cwd(), ".env"),
];

for (const candidate of candidates) {
  if (!existsSync(candidate)) continue;
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    // Malformed .env must not crash the process; the missing variables will
    // surface with a clearer error at the point of use.
  }
}
