import OpenAI from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import {
    createOpenAIChatCompletionsModel,
    type OpenAIChatClient,
} from '../chat-completions/chat-model.js';
import {
    createOpenAIProvider,
    type OpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '../shared/provider-factory.js';

export type OpenAICompatProviderOptions = OpenAIProviderBaseOptions;
export type OpenAICompatProvider = OpenAIProvider;

/** @deprecated Use `createOpenAI().chat` or `@core-ai/openai-compat`. */
export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    return createOpenAIProvider(options, {
        defaultApi: 'chat-completions',
        chat: { compatibility: true },
    });
}

export type OpenAICompatChatProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAIChatClient;
};

export type OpenAICompatChatProvider = {
    chatModel(modelId: string): ChatModel;
};

/**
 * Creates a chat-only OpenAI-compatible provider. Handles client construction
 * internally so consumers do not need a direct dependency on the `openai` package.
 *
 * @deprecated Use the provider composition exports from `@core-ai/openai`.
 */
export function createOpenAICompatChatProvider(
    options: OpenAICompatChatProviderOptions = {},
    providerId = 'openai'
): OpenAICompatChatProvider {
    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });

    return {
        chatModel: (modelId) =>
            createOpenAIChatCompletionsModel(client, modelId, {
                providerId,
                compatibility: true,
            }),
    };
}
