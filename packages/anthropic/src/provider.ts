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
};

/**
 * Factory options for sibling packages that compose Anthropic chat.
 * Not part of {@link createAnthropic} / {@link AnthropicProviderOptions} —
 * first-party Anthropic defaults to strict tool schemas when a tool omits
 * `strict` on its definition.
 */
export type AnthropicChatProviderFactoryOptions = {
    providerId?: string;
    /**
     * Default for tools that omit `ToolDefinition.strict`. Per-tool `strict`
     * always wins when set. Anthropic caps requests at 20 strict tools.
     */
    useStrictToolSchemas?: boolean;
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
 * and factory options; end users should prefer {@link createAnthropic}.
 */
export function createAnthropicChatProvider(
    options: AnthropicChatProviderOptions = {},
    factoryOptions: AnthropicChatProviderFactoryOptions = {}
): AnthropicChatProvider {
    const client =
        options.client ??
        new Anthropic({
            apiKey: options.apiKey,
            baseURL: options.baseURL,
        });
    const defaultMaxTokens = options.defaultMaxTokens ?? 4096;
    const providerId = factoryOptions.providerId ?? DEFAULT_PROVIDER_ID;
    const useStrictToolSchemas = factoryOptions.useStrictToolSchemas ?? true;

    return {
        chatModel: (modelId) =>
            createAnthropicChatModel(client, modelId, {
                defaultMaxTokens,
                providerId,
                useStrictToolSchemas,
            }),
    };
}

export function createAnthropic(
    options: AnthropicProviderOptions = {}
): AnthropicProvider {
    return createAnthropicChatProvider(options);
}
