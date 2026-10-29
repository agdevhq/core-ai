import OpenAI from 'openai';
import {
    getRegisteredModelCapabilities,
    type ChatModel,
    type EmbeddingModel,
    type ImageModel,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

import { createOpenAIChatCompletionsModel } from '../chat-completions/chat-model.ts';
import { createOpenAIChatModel } from '../chat-model.ts';
import { createOpenAIEmbeddingModel } from '../embedding-model.ts';
import { createOpenAIImageModel } from '../image-model.ts';
import {
    getOpenAIModelCapabilities,
    omitOpenAIInputLimits,
    toOpenAIResponsesCapabilities,
} from '../model-capabilities.ts';
import {
    openaiChatGenerateProviderOptionsSchema,
    openaiResponsesGenerateProviderOptionsSchema,
    type OpenAIChatGenerateProviderOptionsConfig,
    type OpenAIResponsesGenerateProviderOptionsConfig,
} from '../provider-options.ts';
import type {
    OpenAICompatibility,
    OpenAIResolvedCompatibilityOptions,
} from './compatibility-options.ts';

export type {
    OpenAICompatibility,
    OpenAICompatibilityOptions,
} from './compatibility-options.ts';

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
    /** Also the `providerOptions` and reasoning `providerMetadata` key. */
    providerId?: string;
    /** Chat Completions provider options schema. */
    providerOptionsSchema?: OpenAIChatGenerateProviderOptionsConfig['schema'];
    /** Responses API provider options schema. */
    responsesProviderOptionsSchema?: OpenAIResponsesGenerateProviderOptionsConfig['schema'];
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
    // OpenAI's input limits describe api.openai.com only. Other servers that
    // speak the same API (Azure, proxies, self-hosted) enforce their own.
    const servesOpenAIInputLimits = isOpenAIHost(client.baseURL);
    const resolveCapabilities = (modelId: string): ModelCapabilities => {
        const registered = getRegisteredModelCapabilities(
            factoryOptions.modelCapabilities,
            modelId
        );
        if (registered) {
            return registered;
        }

        const capabilities = getOpenAIModelCapabilities(modelId);
        return servesOpenAIInputLimits
            ? capabilities
            : omitOpenAIInputLimits(capabilities);
    };
    const createResponsesModel = (modelId: string) =>
        createOpenAIChatModel(
            client,
            modelId,
            toOpenAIResponsesCapabilities(resolveCapabilities(modelId)),
            {
                providerId,
                providerOptions: {
                    key: providerId,
                    schema:
                        factoryOptions.responsesProviderOptionsSchema ??
                        openaiResponsesGenerateProviderOptionsSchema,
                },
            }
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
                      reasoningTokenAccounting:
                          compatibilityOptions?.reasoningTokenAccounting,
                  }
                : undefined;

        return createOpenAIChatCompletionsModel(client, modelId, {
            providerId,
            capabilities,
            compatibility,
            providerOptions: {
                key: providerId,
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

const OPENAI_API_HOSTNAME = 'api.openai.com';

/** `api.openai.com` and its regional hosts, such as `eu.api.openai.com`. */
function isOpenAIHost(baseURL: string | undefined): boolean {
    if (!baseURL || !URL.canParse(baseURL)) {
        return false;
    }

    const { hostname } = new URL(baseURL);
    return (
        hostname === OPENAI_API_HOSTNAME ||
        hostname.endsWith(`.${OPENAI_API_HOSTNAME}`)
    );
}
