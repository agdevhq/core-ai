import Anthropic from '@anthropic-ai/sdk';
import type { ChatModel } from '@core-ai/core-ai';

import { DEFAULT_PROVIDER_ID } from './chat-adapter.js';
import {
    createAnthropicChatModel,
    type AnthropicChatClient,
} from './chat-model.js';

export type { AnthropicChatClient };

export type AnthropicChatProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    client?: AnthropicChatClient;
    defaultMaxTokens?: number;
    strictToolSchemas?: boolean;
};

export type AnthropicChatProvider = {
    chatModel(modelId: string): ChatModel;
};

export type AnthropicProviderOptions = AnthropicChatProviderOptions;
export type AnthropicProvider = AnthropicChatProvider;

/**
 * Creates a chat-only Anthropic provider. Handles client construction
 * internally so consumers do not need a direct dependency on the
 * `@anthropic-ai/sdk` package, and attributes generation, streaming, and
 * error handling to the given provider id.
 *
 * Sibling packages (e.g. `@core-ai/anthropic-vertex`) pass a custom client
 * and provider id; end users should prefer {@link createAnthropic}.
 */
export function createAnthropicChatProvider(
    options: AnthropicChatProviderOptions = {},
    providerId = DEFAULT_PROVIDER_ID
): AnthropicChatProvider {
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
                providerId,
                options.strictToolSchemas
            ),
    };
}

export function createAnthropic(
    options: AnthropicProviderOptions = {}
): AnthropicProvider {
    return createAnthropicChatProvider(options, DEFAULT_PROVIDER_ID);
}
