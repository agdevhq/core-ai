import OpenAI from 'openai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';
import { createOpenAICompatChatModel } from './chat-model.js';
import { createOpenAIEmbeddingModel } from '../embedding-model.js';
import { createOpenAIImageModel } from '../image-model.js';

export type OpenAICompatProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAI;
};

export type OpenAICompatProvider = {
    chatModel(modelId: string): ChatModel;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });

    return {
        chatModel: (modelId) => createOpenAICompatChatModel(client, modelId),
        embeddingModel: (modelId) =>
            createOpenAIEmbeddingModel(client, modelId),
        imageModel: (modelId) => createOpenAIImageModel(client, modelId),
    };
}
