import { GeminiProvider } from "./gemini.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import { LlmError, type LlmProvider } from "./types.js";

export type LlmEnv = {
  LLM_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  GEMINI_CHAT_MODEL?: string;
  GEMINI_EMBEDDING_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSION?: string;
};

export type LlmConfig = {
  provider: LlmProvider;
  providerName: string;
  /** The embedding dimension the configured provider produces. */
  embeddingDimension: number;
};

/**
 * Builds the configured provider from environment variables.
 *
 * LLM_PROVIDER selects the implementation explicitly. When it is not set the
 * provider is inferred from the available credentials, preferring Gemini
 * because the hackathon credits are issued there.
 */
export function createLlmProvider(env: LlmEnv): LlmConfig {
  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const dimension = Number(env.EMBEDDING_DIMENSION ?? "") || undefined;

  const geminiKey = env.GEMINI_API_KEY?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();

  if (requested === "gemini" || (!requested && geminiKey)) {
    if (!geminiKey) {
      throw new LlmError(
        "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set",
        "gemini",
        "missing_credentials",
      );
    }
    return {
      provider: new GeminiProvider({
        apiKey: geminiKey,
        baseUrl: env.GEMINI_BASE_URL,
        chatModel: env.GEMINI_CHAT_MODEL,
        embeddingModel: env.GEMINI_EMBEDDING_MODEL,
        dimension,
      }),
      providerName: "gemini",
      embeddingDimension: dimension ?? 768,
    };
  }

  if (requested === "openai" || requested === "openai-compatible") {
    if (!openAiKey) {
      throw new LlmError(
        "LLM_PROVIDER=openai but OPENAI_API_KEY is not set",
        "openai-compatible",
        "missing_credentials",
      );
    }
    return {
      provider: new OpenAiCompatibleProvider({
        apiKey: openAiKey,
        baseUrl: env.OPENAI_BASE_URL,
        chatModel: env.OPENAI_CHAT_MODEL,
        embeddingModel: env.OPENAI_EMBEDDING_MODEL,
        dimension,
      }),
      providerName: "openai-compatible",
      embeddingDimension: dimension ?? 1536,
    };
  }

  if (requested) {
    throw new LlmError(
      `Unknown LLM_PROVIDER "${requested}". Use "gemini" or "openai".`,
      "unknown",
      "missing_credentials",
    );
  }

  throw new LlmError(
    "No LLM provider configured. Set LLM_PROVIDER and the matching API key.",
    "unknown",
    "missing_credentials",
  );
}

/**
 * True when at least one provider credential is present.
 *
 * The API uses this to answer with an explanatory payload instead of a
 * crash when the hackathon credits have not been claimed yet.
 */
export function hasLlmCredentials(env: LlmEnv): boolean {
  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (requested === "gemini") return Boolean(env.GEMINI_API_KEY?.trim());
  if (requested === "openai" || requested === "openai-compatible") {
    return Boolean(env.OPENAI_API_KEY?.trim());
  }
  return Boolean(env.GEMINI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim());
}
