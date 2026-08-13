import OpenAI from 'openai';
import {
    getRegisteredModelCapabilities,
    type ChatModel,
    type EmbeddingModel,
    type ImageModel,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

import { createOpenAIChatCompletionsModel } from '../chat-completions/chat-model.js';
import { createOpenAIChatModel } from '../chat-model.js';
import { createOpenAIEmbeddingModel } from '../embedding-model.js';
import { createOpenAIImageModel } from '../image-model.js';
import {
    getOpenAIModelCapabilities,
    toOpenAIResponsesCapabilities,
} from '../model-capabilities.js';
import {
    openaiChatGenerateProviderOptionsSchema,
    type OpenAIChatGenerateProviderOptionsConfig,
} from '../provider-options.js';
import type {
    OpenAICompatibility,
    OpenAIResolvedCompatibilityOptions,
} from './compatibility-options.js';

export type {
    OpenAICompatibility,
    OpenAICompatibilityOptions,
} from './compatibility-options.js';

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
    modelCapabilities?: ModelCapabilitiesRegistry;
    providerId?: string;
    providerOptionsKey?: string;
    providerOptionsSchema?: OpenAIChatGenerateProviderOptionsConfig['schema'];
    defaultApi?: 'responses' | 'chat-completions';
    compatibility?: OpenAICompatibility;
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
    const compatibilityOptions =
        typeof factoryOptions.compatibility === 'object'
            ? factoryOptions.compatibility
            : undefined;
    const resolveCapabilities = (modelId: string): ModelCapabilities =>
        getRegisteredModelCapabilities(
            factoryOptions.modelCapabilities,
            modelId
        ) ?? getOpenAIModelCapabilities(modelId);
    const createResponsesModel = (modelId: string) =>
        createOpenAIChatModel(
            client,
            modelId,
            toOpenAIResponsesCapabilities(
                resolveCapabilities(modelId),
                modelId
            ),
            providerId
        );
    const createChatCompletionsModel = (modelId: string) => {
        const capabilities = resolveCapabilities(modelId);
        const compatibility: OpenAIResolvedCompatibilityOptions | undefined =
            factoryOptions.compatibility
                ? {
                      reasoning:
                          typeof compatibilityOptions?.reasoning === 'object'
                              ? {
                                    ...compatibilityOptions.reasoning,
                                    providerMetadataKey:
                                        compatibilityOptions.reasoning
                                            .providerMetadataKey ?? providerId,
                                }
                              : (compatibilityOptions?.reasoning ?? true),
                      structuredOutputMode:
                          compatibilityOptions?.structuredOutputMode,
                      maxTokensParameter:
                          compatibilityOptions?.maxTokensParameter,
                  }
                : undefined;

        return createOpenAIChatCompletionsModel(client, modelId, {
            providerId,
            capabilities,
            compatibility,
            providerOptions: {
                key: factoryOptions.providerOptionsKey ?? providerId,
                schema:
                    factoryOptions.providerOptionsSchema ??
                    openaiChatGenerateProviderOptionsSchema,
            },
        });
    };
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
