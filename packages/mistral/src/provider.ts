import { Mistral } from '@mistralai/mistralai';
import type { ChatModel, EmbeddingModel } from '@core-ai/core-ai';
import { createMistralChatModel } from './chat-model.ts';
import { createMistralEmbeddingModel } from './embedding-model.ts';

export type MistralProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: Mistral;
    /**
     * Retries of chat requests that fail transiently (rate limit, overload,
     * 5xx, network failure) before the response starts. Defaults to 2;
     * `0` disables them.
     */
    maxRetries?: number;
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
            ...(options.baseURL ? { serverURL: options.baseURL } : {}),
        });

    return {
        chatModel: (modelId) =>
            createMistralChatModel(client, modelId, {
                maxRetries: options.maxRetries,
            }),
        embeddingModel: (modelId) =>
            createMistralEmbeddingModel(client, modelId),
    };
}
