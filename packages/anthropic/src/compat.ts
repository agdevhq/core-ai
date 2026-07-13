import Anthropic from '@anthropic-ai/sdk';
import type { ChatModel } from '@core-ai/core-ai';
import { createAnthropicChatModel, type AnthropicChatClient } from './chat-model.js';
import { DEFAULT_PROVIDER_ID } from './chat-adapter.js';

export { createAnthropicChatModel };
export type { AnthropicChatClient };
export { wrapError as wrapAnthropicError } from './chat-adapter.js';

export type AnthropicCompatChatProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: AnthropicChatClient;
    defaultMaxTokens?: number;
};

export type AnthropicCompatChatProvider = {
    chatModel(modelId: string): ChatModel;
};

/**
 * Creates a chat-only Anthropic-compatible provider. Handles client
 * construction internally so consumers do not need a direct dependency on
 * the `@anthropic-ai/sdk` package, and attributes generation, streaming, and
 * error handling to the given provider id.
 */
export function createAnthropicCompatChatProvider(
    options: AnthropicCompatChatProviderOptions = {},
    providerId = DEFAULT_PROVIDER_ID
): AnthropicCompatChatProvider {
    const client =
        options.client ??
        new Anthropic({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });
    const defaultMaxTokens = options.defaultMaxTokens ?? 4096;

    return {
        chatModel: (modelId) =>
            createAnthropicChatModel(
                client,
                modelId,
                defaultMaxTokens,
                providerId
            ),
    };
}
