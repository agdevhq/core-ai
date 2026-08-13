import type {
    ChatModel,
    EmbeddingModel,
    ImageModel,
} from '../../../../packages/core-ai/src/index.ts';

export type ProviderId =
    | 'openai'
    | 'openai-chat'
    | 'openai-compat'
    | 'azure-openai'
    | 'azure-openai-chat'
    | 'azure-openai-classic'
    | 'anthropic'
    | 'anthropic-vertex'
    | 'google'
    | 'google-vertex'
    | 'mistral'
    | 'omnifact'
    | 'kimi';

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
    /**
     * Whether the account/deployment behind this adapter has strict tool
     * schemas available (e.g. the Vertex org policy or an Azure deployment
     * with structured outputs). Absent means yes; model capability support is
     * checked separately.
     */
    isStrictToolsConfigured?: () => boolean;
    createReasoningChatModel?: () => ChatModel;
    createEmbeddingModel?: () => EmbeddingModel;
    createImageModel?: () => ImageModel;
};
