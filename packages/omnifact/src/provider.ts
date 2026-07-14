import type { ChatModel } from '@core-ai/core-ai';
import { createOpenAIProvider } from '@core-ai/openai';
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

    const provider = createOpenAIProvider(
        {
            apiKey: options.apiKey,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        },
        {
            providerId: 'omnifact',
            defaultApi: 'chat-completions',
            chat: { compatibility: true },
        }
    );

    return {
        chatModel: provider.chatModel,
    };
}
