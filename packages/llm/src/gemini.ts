import {
  LlmError,
  type ChatRequest,
  type ChatResponse,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type LlmProvider,
} from "./types.js";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";

export type GeminiProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  /** Gemini returns 768 dimensions for text-embedding-004. */
  dimension?: number;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

type GeminiEmbedResponse = {
  embeddings?: Array<{ values: number[] }>;
};

/**
 * Google AI (Gemini) provider.
 *
 * The API key is sent as a query parameter, which is what the Google AI
 * Studio REST endpoints expect for the generateContent and embedContent
 * calls. It never leaves the server process.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly dimension: number;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) {
      throw new LlmError("Gemini API key is missing", "gemini", "missing_credentials");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.chatModel = options.chatModel ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.dimension = options.dimension ?? 768;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Gemini separates the system instruction from the conversation history.
    const systemParts = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const url = `${this.baseUrl}/models/${this.chatModel}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
      },
    };
    if (systemParts) {
      body.systemInstruction = { parts: [{ text: systemParts }] };
    }

    const payload = await this.postJson<GeminiGenerateResponse>(url, body, "gemini");

    const blockReason = payload.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(
        `Gemini blocked the request: ${blockReason}`,
        "gemini",
        "safety_block",
      );
    }

    const candidate = payload.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";

    if (!text && candidate?.finishReason) {
      throw new LlmError(
        `Gemini returned no content (${candidate.finishReason})`,
        "gemini",
        "safety_block",
      );
    }

    return {
      text,
      provider: this.name,
      model: this.chatModel,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const url = `${this.baseUrl}/models/${this.embeddingModel}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      requests: request.texts.map((text) => ({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text }] },
        taskType: request.kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
      })),
    };

    const payload = await this.postJson<GeminiEmbedResponse>(url, body, "gemini");

    const vectors = (payload.embeddings ?? []).map((embedding) => embedding.values);
    if (vectors.length !== request.texts.length) {
      throw new LlmError(
        `Gemini returned ${vectors.length} embeddings for ${request.texts.length} inputs`,
        "gemini",
        "bad_response",
      );
    }

    const dimension = vectors[0]?.length ?? this.dimension;

    return {
      vectors,
      provider: this.name,
      model: this.embeddingModel,
      dimension,
    };
  }

  private async postJson<T>(
    url: string,
    body: unknown,
    provider: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (caught) {
      throw new LlmError(
        caught instanceof Error ? caught.message : "network failure",
        provider,
        "network",
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new LlmError(
        `${provider} request failed with HTTP ${response.status}: ${detail.slice(0, 300)}`,
        provider,
        response.status === 401 || response.status === 403
          ? "unauthorized"
          : response.status === 429
            ? "rate_limit"
            : "bad_response",
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new LlmError(
        `${provider} returned a malformed response`,
        provider,
        "bad_response",
      );
    }
  }
}
