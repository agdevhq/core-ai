import OpenAI from 'openai';
import type { ChatModel, EmbeddingModel, ImageModel } from '@core-ai/core-ai';

import {
    createOpenAIChatCompletionsModel,
    type OpenAIChatCompletionsModelOptions,
} from '../chat-completions/chat-model.js';
import { createOpenAIChatModel } from '../chat-model.js';
import { createOpenAIEmbeddingModel } from '../embedding-model.js';
import { createOpenAIImageModel } from '../image-model.js';

export type OpenAIProviderBaseOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAI;
};

export type OpenAIProvider = {
    chatModel(modelId: string): ChatModel;
    chat: OpenAIChatProvider;
    embeddingModel(modelId: string): EmbeddingModel;
    imageModel(modelId: string): ImageModel;
};

export type OpenAIChatProvider = {
    chatModel(modelId: string): ChatModel;
};

export type OpenAIProviderFactoryOptions = {
    providerId?: string;
    defaultApi?: 'responses' | 'chat-completions';
    chat?: Pick<OpenAIChatCompletionsModelOptions, 'compatibility'>;
};

export function createOpenAIProvider(
    options: OpenAIProviderBaseOptions,
    factoryOptions: OpenAIProviderFactoryOptions = {}
): OpenAIProvider {
    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });
    const providerId = factoryOptions.providerId ?? 'openai';
    const createResponsesModel = (modelId: string) =>
        createOpenAIChatModel(client, modelId, providerId);
    const createChatCompletionsModel = (modelId: string) =>
        createOpenAIChatCompletionsModel(client, modelId, {
            providerId,
            compatibility: factoryOptions.chat?.compatibility,
        });
    const chat = {
        chatModel: createChatCompletionsModel,
    };

    return {
        chatModel:
            factoryOptions.defaultApi === 'chat-completions'
                ? createChatCompletionsModel
                : createResponsesModel,
        chat,
        embeddingModel: (modelId) =>
            createOpenAIEmbeddingModel(client, modelId),
        imageModel: (modelId) => createOpenAIImageModel(client, modelId),
    };
}
