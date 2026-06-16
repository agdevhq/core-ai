import OpenAI from 'openai';
import type { ChatModel } from '@core-ai/core-ai';
import { createKimiChatModel } from './chat-model.js';
import { DEFAULT_BASE_URL } from './constants.ts';

export type KimiProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: OpenAI;
};

export type KimiProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createKimi(options: KimiProviderOptions = {}): KimiProvider {
    if (!options.apiKey && !options.client) {
        throw new Error('createKimi: apiKey is required.');
    }

    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        });

    return {
        chatModel: (modelId) => createKimiChatModel(client, modelId),
    };
}
