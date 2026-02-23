import { Mistral } from '@mistralai/mistralai';
import type { ChatModel, EmbeddingModel } from '@core-ai/core-ai';
import { createMistralChatModel } from './chat-model.js';
import { createMistralEmbeddingModel } from './embedding-model.js';

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
            ...(options.baseURL ? { serverURL: options.baseURL } : {}),
        });

    return {
        chatModel: (modelId) => createMistralChatModel(client, modelId),
        embeddingModel: (modelId) =>
            createMistralEmbeddingModel(client, modelId),
    };
}
