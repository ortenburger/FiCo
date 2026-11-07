import {
  LlmError,
  type ChatRequest,
  type ChatResponse,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type LlmProvider,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export type OpenAiCompatibleOptions = {
  apiKey: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  /** text-embedding-3-small returns 1536 dimensions. */
  dimension?: number;
  /** OpenAI embeddings accept a dimensions parameter to shorten the vector. */
  dimensionsParam?: boolean;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type OpenAiEmbedResponse = {
  data?: Array<{ embedding: number[] }>;
};

/**
 * Any OpenAI-compatible chat and embeddings endpoint.
 *
 * Covers OpenAI itself plus every gateway that speaks the same protocol,
 * which includes Ollama, LM Studio, vLLM and most hosted routers.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly dimension: number;
  private readonly dimensionsParam: boolean;

  constructor(options: OpenAiCompatibleOptions) {
    if (!options.apiKey) {
      throw new LlmError(
        "OpenAI-compatible API key is missing",
        this.name,
        "missing_credentials",
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.chatModel = options.chatModel ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.dimension = options.dimension ?? 1536;
    this.dimensionsParam = options.dimensionsParam ?? false;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload = await this.postJson<OpenAiChatResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.chatModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { max_tokens: request.maxOutputTokens }),
      },
    );

    const choice = payload.choices?.[0];
    const text = choice?.message?.content?.trim() ?? "";

    if (!text && choice?.finish_reason === "content_filter") {
      throw new LlmError(
        "The provider filtered the response",
        this.name,
        "safety_block",
      );
    }

    return {
      text,
      provider: this.name,
      model: this.chatModel,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const payload = await this.postJson<OpenAiEmbedResponse>(
      `${this.baseUrl}/embeddings`,
      {
        model: this.embeddingModel,
        input: request.texts,
        ...(this.dimensionsParam ? { dimensions: this.dimension } : {}),
      },
    );

    const vectors = (payload.data ?? []).map((entry) => entry.embedding);
    if (vectors.length !== request.texts.length) {
      throw new LlmError(
        `Expected ${request.texts.length} embeddings, got ${vectors.length}`,
        this.name,
        "bad_response",
      );
    }

    return {
      vectors,
      provider: this.name,
      model: this.embeddingModel,
      dimension: vectors[0]?.length ?? this.dimension,
    };
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (caught) {
      throw new LlmError(
        caught instanceof Error ? caught.message : "network failure",
        this.name,
        "network",
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new LlmError(
        `${this.name} request failed with HTTP ${response.status}: ${detail.slice(0, 300)}`,
        this.name,
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
        `${this.name} returned a malformed response`,
        this.name,
        "bad_response",
      );
    }
  }
}
