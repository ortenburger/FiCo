/**
 * Provider-neutral contracts for language models and embeddings.
 *
 * FiCo talks to several model providers (Google AI for the hackathon credits,
 * any OpenAI-compatible gateway, a local Ollama). The rest of the codebase
 * only sees these interfaces, so switching a provider is a configuration
 * change, not a code change.
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type ChatResponse = {
  text: string;
  provider: string;
  model: string;
  /** Set when the provider refused to answer, e.g. a safety block. */
  blocked?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type EmbeddingRequest = {
  /** Texts to embed. Batched because the providers support it. */
  texts: string[];
  /** Hint for the caller, ignored by providers that do not need it. */
  kind?: "document" | "query";
};

export type EmbeddingResponse = {
  /** One vector per input text, in the same order. */
  vectors: number[][];
  provider: string;
  model: string;
  dimension: number;
};

export type LlmProvider = {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly reason:
      | "missing_credentials"
      | "unauthorized"
      | "rate_limit"
      | "safety_block"
      | "network"
      | "bad_response",
  ) {
    super(message);
    this.name = "LlmError";
  }
}
