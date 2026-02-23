import Anthropic from '@anthropic-ai/sdk';
import type { ChatModel } from '@core-ai/ai';
import { createAnthropicChatModel } from './chat-model.js';

export type AnthropicProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: Anthropic;
    defaultMaxTokens?: number;
};

export type AnthropicProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createAnthropic(
    options: AnthropicProviderOptions = {}
): AnthropicProvider {
    const client =
        options.client ??
        new Anthropic({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });

    const defaultMaxTokens = options.defaultMaxTokens ?? 4096;

    return {
        chatModel: (modelId) =>
            createAnthropicChatModel(client, modelId, defaultMaxTokens),
    };
}
