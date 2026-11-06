import { Mistral } from '@mistralai/mistralai';
import type { RetryConfig } from '@mistralai/mistralai/lib/retries.js';
import type { ChatModel, EmbeddingModel } from '@core-ai/core-ai';
import { createMistralChatModel } from './chat-model.ts';
import { createMistralEmbeddingModel } from './embedding-model.ts';

/**
 * The SDK retries nothing by default. It limits retries by elapsed time, not by
 * count, and its own limit is an hour.
 */
const REQUEST_RETRY_CONFIG: RetryConfig = {
    strategy: 'backoff',
    backoff: {
        initialInterval: 1_000,
        maxInterval: 8_000,
        exponent: 2,
        maxElapsedTime: 5_000,
    },
    retryConnectionErrors: true,
};

export type MistralProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: Mistral;
};

export type MistralProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
};

export function createMistral(
    options: MistralProviderOptions = {}
): MistralProvider {
    const client =
        options.client ??
        new Mistral({
            apiKey: options.apiKey,
            retryConfig: REQUEST_RETRY_CONFIG,
            ...(options.baseURL ? { serverURL: options.baseURL } : {}),
        });

    return {
        chatModel: (modelId) => createMistralChatModel(client, modelId),
        embeddingModel: (modelId) =>
            createMistralEmbeddingModel(client, modelId),
    };
}
