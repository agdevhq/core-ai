import type {
    ChatModel,
    EmbeddingModel,
    ImageModel,
} from '../../../../packages/core-ai/src/index.ts';

export type ProviderId =
    | 'openai'
    | 'openai-compat'
    | 'anthropic'
    | 'google'
    | 'mistral';

export type ProviderCapabilities = {
    chat: boolean;
    stream: boolean;
    object: boolean;
    reasoning: boolean;
    embedding: boolean;
    image: boolean;
};

export type ProviderModelIds = {
    chat: string;
    reasoning?: string;
    embedding?: string;
    image?: string;
};

export type ProviderE2EAdapter = {
    id: ProviderId;
    displayName: string;
    apiKeyEnvVar: string;
    models: ProviderModelIds;
    capabilities: ProviderCapabilities;
    isConfigured: () => boolean;
    createChatModel: () => ChatModel;
    createReasoningChatModel?: () => ChatModel;
    createEmbeddingModel?: () => EmbeddingModel;
    createImageModel?: () => ImageModel;
};
