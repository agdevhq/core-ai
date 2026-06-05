import type { ChatModel } from '@core-ai/core-ai';
import { createOpenAICompatChatProvider } from '@core-ai/openai/compat';
import { DEFAULT_BASE_URL } from './constants.js';

export type OmnifactProviderOptions = {
    apiKey?: string;
    baseURL?: string;
};

export type OmnifactProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createOmnifact(
    options: OmnifactProviderOptions = {}
): OmnifactProvider {
    if (!options.apiKey) {
        throw new Error('createOmnifact: apiKey is required.');
    }

    return createOpenAICompatChatProvider(
        {
            apiKey: options.apiKey,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        },
        'omnifact'
    );
}
