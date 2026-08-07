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
    /**
     * Application-owned metadata for this part. Provider adapters ignore this
     * field and never serialize it to provider APIs.
     */
    metadata?: Record<string, unknown>;
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

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'max';

export type ReasoningConfig = {
    effort: ReasoningEffort;
};

export type AssistantTextPart = {
    type: 'text';
    text: string;
    /**
     * Application-owned metadata for this part. Provider adapters ignore this
     * field and never serialize it to provider APIs.
     */
    metadata?: Record<string, unknown>;
};

export type ReasoningPart = {
    type: 'reasoning';
    text: string;
    /**
     * Application-owned metadata for this part. Provider adapters ignore this
     * field and never serialize it to provider APIs.
     */
    metadata?: Record<string, unknown>;
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
    /**
     * Application-owned metadata for this tool call. Provider adapters ignore
     * this field and never serialize it to provider APIs.
     */
    metadata?: Record<string, unknown>;
};

export type ToolResultMessage = {
    role: 'tool';
    toolCallId: string;
    content: string;
    isError?: boolean;
    /**
     * Application-owned metadata for this tool result. Provider adapters ignore
     * this field and never serialize it to provider APIs.
     */
    metadata?: Record<string, unknown>;
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

export type ToolChoiceMode = 'auto' | 'none' | 'required' | 'tool';

/**
 * Modalities a chat model can accept in user messages.
 *
 * `file` covers document attachments such as PDFs. `audio` and `video` are
 * reserved for future input parts.
 */
export type ChatInputModality =
    | 'text'
    | 'image'
    | 'file'
    | 'audio'
    | 'video';

/**
 * Modalities a chat model can emit as assistant content.
 *
 * Dedicated generators (`ImageModel`, and future audio/video models) are
 * separate operations. Chat `output` describes native multimodal responses
 * from `generate` / `stream`, not those dedicated APIs.
 */
export type ChatOutputModality = 'text' | 'image' | 'audio' | 'video';

export type ModelCapabilities = {
    reasoning: {
        mode: 'unsupported' | 'optional' | 'always-on';
        supportedEfforts: readonly ReasoningEffort[];
        /**
         * Whether reasoning changes which sampling parameters or values the
         * provider accepts.
         */
        restrictsSamplingParams: boolean;
        supportedToolChoices: readonly ToolChoiceMode[];
    };
    modalities: {
        /** Modalities accepted in user messages. Always includes `'text'`. */
        input: readonly ChatInputModality[];
        /**
         * Modalities the model can emit as assistant content. Always includes
         * `'text'`. Does not describe dedicated `ImageModel` generation.
         */
        output: readonly ChatOutputModality[];
    };
};

export type ChatModel = {
    readonly provider: string;
    readonly modelId: string;
    readonly capabilities: ModelCapabilities;
    generate(options: GenerateOptions): Promise<GenerateResult>;
    stream(options: GenerateOptions): Promise<ChatStream>;
    generateObject<TSchema extends z.ZodType>(
        options: GenerateObjectOptions<TSchema>
    ): Promise<GenerateObjectResult<TSchema>>;
    streamObject<TSchema extends z.ZodType>(
        options: StreamObjectOptions<TSchema>
    ): Promise<ObjectStream<TSchema>>;
};

export interface GenerateProviderOptions {
    [key: string]: Record<string, unknown> | undefined;
}

export interface EmbedProviderOptions {
    [key: string]: Record<string, unknown> | undefined;
}

export interface ImageProviderOptions {
    [key: string]: Record<string, unknown> | undefined;
}

export type ChatModelMiddleware = {
    generate?: (args: {
        execute: (options?: GenerateOptions) => Promise<GenerateResult>;
        options: GenerateOptions;
        model: ChatModel;
    }) => Promise<GenerateResult>;
    stream?: (args: {
        execute: (options?: GenerateOptions) => Promise<ChatStream>;
        options: GenerateOptions;
        model: ChatModel;
    }) => Promise<ChatStream>;
    generateObject?: <TSchema extends z.ZodType>(args: {
        execute: (
            options?: GenerateObjectOptions<TSchema>
        ) => Promise<GenerateObjectResult<TSchema>>;
        options: GenerateObjectOptions<TSchema>;
        model: ChatModel;
    }) => Promise<GenerateObjectResult<TSchema>>;
    streamObject?: <TSchema extends z.ZodType>(args: {
        execute: (
            options?: StreamObjectOptions<TSchema>
        ) => Promise<ObjectStream<TSchema>>;
        options: StreamObjectOptions<TSchema>;
        model: ChatModel;
    }) => Promise<ObjectStream<TSchema>>;
};

export type EmbeddingModelMiddleware = {
    embed?: (args: {
        execute: (options?: EmbedOptions) => Promise<EmbedResult>;
        options: EmbedOptions;
        model: EmbeddingModel;
    }) => Promise<EmbedResult>;
};

export type ImageModelMiddleware = {
    generate?: (args: {
        execute: (
            options?: ImageGenerateOptions
        ) => Promise<ImageGenerateResult>;
        options: ImageGenerateOptions;
        model: ImageModel;
    }) => Promise<ImageGenerateResult>;
};

export type BaseGenerateOptions = {
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    reasoning?: ReasoningConfig;
    metadata?: Record<string, unknown>;
    providerOptions?: GenerateProviderOptions;
    signal?: AbortSignal;
};

export type GenerateOptions = BaseGenerateOptions & {
    tools?: ToolSet;
    toolChoice?: ToolChoice;
};

export type GenerateResult = {
    parts: AssistantContentPart[];
    content: string | null;
    reasoning: string | null;
    toolCalls: ToolCall[];
    finishReason: FinishReason;
    usage: ChatUsage;
};

export type GenerateObjectOptions<TSchema extends z.ZodType> =
    BaseGenerateOptions & {
        schema: TSchema;
        schemaName?: string;
        schemaDescription?: string;
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
    | {
          type: 'reasoning-end';
          metadata?: Record<string, unknown>;
          providerMetadata?: Record<string, Record<string, unknown>>;
      }
    | { type: 'text-start' }
    | { type: 'text-delta'; text: string }
    | { type: 'text-end'; metadata?: Record<string, unknown> }
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argumentsDelta: string }
    | { type: 'tool-call-end'; toolCall: ToolCall }
    | { type: 'finish'; finishReason: FinishReason; usage: ChatUsage };

/**
 * Handle for a single in-flight chat streaming operation.
 *
 * The handle is replayable: iterating after some or all events have already
 * arrived replays the buffered event history before waiting for later events.
 *
 * `result` resolves with the aggregated final response when the operation
 * completes successfully, and rejects on abort or upstream failure.
 *
 * `events` always resolves with all observed events up to the terminal point,
 * including abort and failure cases.
 */
export type ChatStream = AsyncIterable<StreamEvent> & {
    readonly result: Promise<GenerateResult>;
    readonly events: Promise<readonly StreamEvent[]>;
};

export type ObjectStreamEvent<TSchema extends z.ZodType> =
    | { type: 'object-delta'; text: string }
    | { type: 'object'; object: z.infer<TSchema> }
    | { type: 'finish'; finishReason: FinishReason; usage: ChatUsage };

/**
 * Handle for a single in-flight structured object streaming operation.
 *
 * The lifecycle semantics mirror `ChatStream`: iteration is replayable,
 * `result` settles independently of event consumption, and `events` resolves
 * with the observed history.
 */
export type ObjectStream<TSchema extends z.ZodType> = AsyncIterable<
    ObjectStreamEvent<TSchema>
> & {
    readonly result: Promise<GenerateObjectResult<TSchema>>;
    readonly events: Promise<readonly ObjectStreamEvent<TSchema>[]>;
};

export type EmbeddingModel = {
    readonly provider: string;
    readonly modelId: string;
    embed(options: EmbedOptions): Promise<EmbedResult>;
};

export type EmbedOptions = {
    input: string | string[];
    dimensions?: number;
    metadata?: Record<string, unknown>;
    providerOptions?: EmbedProviderOptions;
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
    metadata?: Record<string, unknown>;
    providerOptions?: ImageProviderOptions;
};

export type ImageGenerateResult = {
    images: GeneratedImage[];
};

export type GeneratedImage = {
    base64?: string;
    url?: string;
    revisedPrompt?: string;
};
