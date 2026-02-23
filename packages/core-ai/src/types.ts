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

export type AssistantMessage = {
    role: 'assistant';
    content: string | null;
    toolCalls?: ToolCall[];
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
    tools?: ToolSet;
    toolChoice?: ToolChoice;
    config?: ModelConfig;
    providerOptions?: Record<string, unknown>;
    signal?: AbortSignal;
};

export type GenerateResult = {
    content: string | null;
    toolCalls: ToolCall[];
    finishReason: FinishReason;
    usage: ChatUsage;
};

export type FinishReason =
    | 'stop'
    | 'length'
    | 'tool-calls'
    | 'content-filter'
    | 'unknown';

export type ChatUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
};

export type StreamEvent =
    | { type: 'content-delta'; text: string }
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argumentsDelta: string }
    | { type: 'tool-call-end'; toolCall: ToolCall }
    | { type: 'finish'; finishReason: FinishReason; usage: ChatUsage };

export type StreamResult = AsyncIterable<StreamEvent> & {
    toResponse(): Promise<GenerateResult>;
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
    usage: EmbeddingUsage;
};

export type EmbeddingUsage = {
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
