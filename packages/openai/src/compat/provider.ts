import OpenAI from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import { createOpenAICompatChatModel, type OpenAIChatClient } from './chat-model.js';
import {
    createOpenAIProvider,
    type OpenAIProvider,
    type OpenAIProviderBaseOptions,
} from '../shared/provider-factory.js';

export type OpenAICompatProviderOptions = OpenAIProviderBaseOptions;
export type OpenAICompatProvider = OpenAIProvider;

export function createOpenAICompat(
    options: OpenAICompatProviderOptions = {}
): OpenAICompatProvider {
    return createOpenAIProvider(options, createOpenAICompatChatModel);
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
            createOpenAICompatChatModel(client, modelId, providerId),
    };
}
