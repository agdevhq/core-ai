import type { z } from 'zod';

export type Message =
    | SystemMessage
    | UserMessage
    | AssistantMessage
    | ToolResultMessage;

export type SystemMessage = {
    role: 'system';
    content: string;
};

export type UserMessage = {
    role: 'user';
    content: string | UserContentPart[];
};

export type UserContentPart = TextPart | ImagePart | FilePart;

export type TextPart = {
    type: 'text';
    text: string;
};

export type ImagePart = {
    type: 'image';
    source:
        | { type: 'base64'; mediaType: string; data: string }
        | { type: 'url'; url: string };
};

export type FilePart = {
    type: 'file';
    data: string;
    mimeType: string;
    filename?: string;
};

export type ReasoningEffort =
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'max';

export type ReasoningConfig = {
    effort: ReasoningEffort;
};

export type AssistantTextPart = {
    type: 'text';
    text: string;
};

export type ReasoningPart = {
    type: 'reasoning';
    text: string;
    /**
     * Provider-namespaced metadata for this reasoning block. The top-level key is
     * the provider identifier (e.g. `'anthropic'`, `'openai'`), which also serves as
     * the ownership discriminator: an adapter checks for the presence of its own key
     * to detect cross-provider blocks. Cross-provider blocks are downgraded to plain
     * text (preserving context) rather than forwarding opaque metadata that would
     * cause an API error on the receiving provider.
     *
     * @example Anthropic: `{ anthropic: { signature: '...' } }`
     * @example OpenAI:    `{ openai: { encryptedContent: '...' } }`
     */
    providerMetadata?: Record<string, Record<string, unknown>>;
};

export type ToolCallPart = {
    type: 'tool-call';
    toolCall: ToolCall;
};

export type AssistantContentPart =
    | AssistantTextPart
    | ReasoningPart
    | ToolCallPart;

export type AssistantMessage = {
    role: 'assistant';
    parts: AssistantContentPart[];
};

export type ToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
};

export type ToolResultMessage = {
    role: 'tool';
    toolCallId: string;
    content: string;
    isError?: boolean;
};

export type ToolDefinition = {
    name: string;
    description: string;
    parameters: z.ZodType;
};

export type ToolSet = Record<string, ToolDefinition>;

export type ToolChoice =
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'tool'; toolName: string };

export type ChatModel = {
    readonly provider: string;
    readonly modelId: string;
    generate(options: GenerateOptions): Promise<GenerateResult>;
    stream(options: GenerateOptions): Promise<StreamResult>;
    generateObject<TSchema extends z.ZodType>(
        options: GenerateObjectOptions<TSchema>
    ): Promise<GenerateObjectResult<TSchema>>;
    streamObject<TSchema extends z.ZodType>(
        options: StreamObjectOptions<TSchema>
    ): Promise<StreamObjectResult<TSchema>>;
};

export type ModelConfig = {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stopSequences?: string[];
    frequencyPenalty?: number;
    presencePenalty?: number;
};

export type GenerateOptions = {
    messages: Message[];
    reasoning?: ReasoningConfig;
    tools?: ToolSet;
    toolChoice?: ToolChoice;
    config?: ModelConfig;
    providerOptions?: Record<string, unknown>;
    signal?: AbortSignal;
};

export type GenerateResult = {
    parts: AssistantContentPart[];
    content: string | null;
    reasoning: string | null;
    toolCalls: ToolCall[];
    finishReason: FinishReason;
    usage: ChatUsage;
};

export type GenerateObjectOptions<TSchema extends z.ZodType> = {
    messages: Message[];
    schema: TSchema;
    schemaName?: string;
    schemaDescription?: string;
    reasoning?: ReasoningConfig;
    config?: ModelConfig;
    providerOptions?: Record<string, unknown>;
    signal?: AbortSignal;
};

export type StreamObjectOptions<TSchema extends z.ZodType> =
    GenerateObjectOptions<TSchema>;

export type GenerateObjectResult<TSchema extends z.ZodType> = {
    object: z.infer<TSchema>;
    finishReason: FinishReason;
    usage: ChatUsage;
};

export type FinishReason =
    | 'stop'
    | 'length'
    | 'tool-calls'
    | 'content-filter'
    | 'unknown';

/**
 * Token usage reported by the model after a chat completion.
 *
 * `inputTokens` is always the **total** input token count, including cached
 * reads and cache writes. Anthropic's `input_tokens` is normalized by adding
 * `cache_read_input_tokens` and `cache_creation_input_tokens`.
 *
 * `outputTokens` is always the **total** output token count, including both
 * visible text and internal reasoning.
 *
 * `inputTokenDetails` and `outputTokenDetails` provide provider-independent
 * breakdowns for cache and reasoning accounting.
 */
export type ChatUsage = {
    /** Total input tokens, including cached and cache-write tokens. */
    inputTokens: number;
    /** Total output tokens, including both visible text and reasoning. */
    outputTokens: number;
    /** Breakdown of input token categories. */
    inputTokenDetails: ChatInputTokenDetails;
    /** Breakdown of output token categories. */
    outputTokenDetails: ChatOutputTokenDetails;
};

export type ChatInputTokenDetails = {
    /** Input tokens served from a prior cache entry. Subset of `inputTokens`. */
    cacheReadTokens: number;
    /**
     * Input tokens written to cache for future reuse. Subset of `inputTokens`.
     * Only Anthropic reports this; other providers report `0`.
     */
    cacheWriteTokens: number;
};

export type ChatOutputTokenDetails = {
    /**
     * Tokens consumed by internal reasoning/thinking. Subset of `outputTokens`.
     * Omitted when the provider does not report a breakdown.
     */
    reasoningTokens?: number;
};

export type StreamEvent =
    | { type: 'reasoning-start' }
    | { type: 'reasoning-delta'; text: string }
    | { type: 'reasoning-end'; providerMetadata?: Record<string, Record<string, unknown>> }
    | { type: 'text-delta'; text: string }
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argumentsDelta: string }
    | { type: 'tool-call-end'; toolCall: ToolCall }
    | { type: 'finish'; finishReason: FinishReason; usage: ChatUsage };

export type StreamResult = AsyncIterable<StreamEvent> & {
    toResponse(): Promise<GenerateResult>;
};

export type ObjectStreamEvent<TSchema extends z.ZodType> =
    | { type: 'object-delta'; text: string }
    | { type: 'object'; object: z.infer<TSchema> }
    | { type: 'finish'; finishReason: FinishReason; usage: ChatUsage };

export type StreamObjectResult<TSchema extends z.ZodType> = AsyncIterable<
    ObjectStreamEvent<TSchema>
> & {
    toResponse(): Promise<GenerateObjectResult<TSchema>>;
};

export type EmbeddingModel = {
    readonly provider: string;
    readonly modelId: string;
    embed(options: EmbedOptions): Promise<EmbedResult>;
};

export type EmbedOptions = {
    input: string | string[];
    dimensions?: number;
    providerOptions?: Record<string, unknown>;
};

export type EmbedResult = {
    embeddings: number[][];
    /**
     * Optional embedding usage metadata. Some providers/models do not expose
     * token usage for embedding calls.
     */
    usage?: EmbeddingUsage;
};

export type EmbeddingUsage = {
    /** Number of tokens consumed by embedding input. */
    inputTokens: number;
};

export type ImageModel = {
    readonly provider: string;
    readonly modelId: string;
    generate(options: ImageGenerateOptions): Promise<ImageGenerateResult>;
};

export type ImageGenerateOptions = {
    prompt: string;
    n?: number;
    size?: string;
    providerOptions?: Record<string, unknown>;
};

export type ImageGenerateResult = {
    images: GeneratedImage[];
};

export type GeneratedImage = {
    base64?: string;
    url?: string;
    revisedPrompt?: string;
};
