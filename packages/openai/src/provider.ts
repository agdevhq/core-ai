import OpenAI from 'openai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/ai';
import { createOpenAIChatModel } from './chat-model.js';
import { createOpenAIEmbeddingModel } from './embedding-model.js';
import { createOpenAIImageModel } from './image-model.js';

export type OpenAIProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAI;
};

export type OpenAIProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export function createOpenAI(
    options: OpenAIProviderOptions = {}
): OpenAIProvider {
    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });

    return {
        chatModel: (modelId) => createOpenAIChatModel(client, modelId),
        embeddingModel: (modelId) =>
            createOpenAIEmbeddingModel(client, modelId),
        imageModel: (modelId) => createOpenAIImageModel(client, modelId),
    };
}
