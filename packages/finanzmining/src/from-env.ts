import {
  createFinanzminingPlatform,
  type FinanzminingPlatform,
} from "./platform.js";
import { DEFAULT_FINNANZMINING_BASE_URL } from "./http.js";

export type EnvMap = Record<string, string | undefined>;

export function createFinanzminingFromEnv(
  env: EnvMap = process.env as EnvMap,
): FinanzminingPlatform {
  const apiKey = env.FINNANZMINING_API_KEY;
  if (!apiKey) {
    throw new Error("FINNANZMINING_API_KEY is not set");
  }
  return createFinanzminingPlatform({
    baseUrl: env.FINNANZMINING_BASE_URL ?? DEFAULT_FINNANZMINING_BASE_URL,
    apiKey,
    userAccessToken: env.FINNANZMINING_USER_TOKEN,
  });
}
