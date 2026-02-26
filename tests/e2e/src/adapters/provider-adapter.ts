import type {
    ChatModel,
    EmbeddingModel,
    ImageModel,
} from '../../../../packages/core-ai/src/index.ts';

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'mistral';

export type ProviderCapabilities = {
    chat: boolean;
    stream: boolean;
    object: boolean;
    embedding: boolean;
    image: boolean;
};

export type ProviderModelIds = {
    chat: string;
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
    createEmbeddingModel?: () => EmbeddingModel;
    createImageModel?: () => ImageModel;
};
