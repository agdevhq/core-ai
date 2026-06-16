import OpenAI from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import { createXAIChatModel } from './chat-model.ts';
import { DEFAULT_BASE_URL } from './constants.ts';

export type XAIProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAI;
};

export type XAIProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createXAI(options: XAIProviderOptions = {}): XAIProvider {
    if (!options.apiKey && !options.client) {
        throw new Error('createXAI: apiKey is required.');
    }

    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        });

    return {
        chatModel: (modelId) => createXAIChatModel(client, modelId),
    };
}
