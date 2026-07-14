import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineTool, ProviderError } from '@core-ai/core-ai';

import { createAnthropic, createAnthropicChatProvider } from './provider.js';
import type { AnthropicChatClient } from './chat-model.js';

describe('createAnthropic', () => {
    it('should expose chatModel factory only', () => {
        const provider = createAnthropic({
            client: createMockClient(),
        });

        const chatModel = provider.chatModel('claude-haiku-4-5');

        expect(chatModel.provider).toBe('anthropic');
        expect(chatModel.modelId).toBe('claude-haiku-4-5');
    });

    it('should use default max tokens in generated requests', async () => {
        const create = vi.fn(async () => ({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-4-5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            content: [{ type: 'text', text: 'ok', citations: null }],
            container: null,
            usage: {
                input_tokens: 1,
                output_tokens: 1,
            },
        }));
        const provider = createAnthropic({
            client: createMockClient(create),
            defaultMaxTokens: 2048,
        });

        await provider
            .chatModel('claude-haiku-4-5')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ max_tokens: 2048 }),
            expect.objectContaining({ signal: undefined })
        );
    });

    it('should use strict tool schemas', async () => {
        const create = vi.fn(async () => createMockResponse());
        const provider = createAnthropic({
            client: createMockClient(create),
        });

        await provider.chatModel('claude-haiku-4-5').generate({
            messages: [{ role: 'user', content: 'hello' }],
            tools: {
                search: defineTool({
                    name: 'search',
                    description: 'Search the web',
                    parameters: z.object({ query: z.string() }),
                }),
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                tools: [expect.objectContaining({ strict: true })],
            }),
            expect.objectContaining({ signal: undefined })
        );
    });
});

describe('createAnthropicChatProvider', () => {
    it('should create a client from apiKey/baseURL when one is not provided', () => {
        const provider = createAnthropicChatProvider({
            apiKey: 'test-key',
            baseURL: 'https://api.example.com',
        });

        const chatModel = provider.chatModel('claude-haiku-4-5');

        expect(chatModel.provider).toBe('anthropic');
        expect(chatModel.modelId).toBe('claude-haiku-4-5');
    });

    it('should use an injected client instead of constructing one', async () => {
        const create = vi.fn(async () => {
            throw new Error('upstream failure');
        });

        const provider = createAnthropicChatProvider({
            client: createMockChatClient(create),
        });

        await provider
            .chatModel('claude-haiku-4-5')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch(() => undefined);

        expect(create).toHaveBeenCalledTimes(1);
    });

    it('should default to 4096 max tokens', async () => {
        const create = vi.fn(async () => createMockResponse());

        const provider = createAnthropicChatProvider({
            client: createMockChatClient(create),
        });

        await provider
            .chatModel('claude-haiku-4-5')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ max_tokens: 4096 }),
            expect.objectContaining({ signal: undefined })
        );
    });

    it('should attribute the chat model and errors to a custom provider id', async () => {
        const create = vi.fn(async () => {
            throw new Error('upstream failure');
        });

        const provider = createAnthropicChatProvider(
            { client: createMockChatClient(create) },
            'anthropic-vertex'
        );
        const chatModel = provider.chatModel('claude-sonnet-4-6');

        expect(chatModel.provider).toBe('anthropic-vertex');

        const error = await chatModel
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('anthropic-vertex');
    });
});

function createMockResponse() {
    return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        stop_reason: 'end_turn',
        stop_sequence: null,
        content: [{ type: 'text', text: 'ok', citations: null }],
        container: null,
        usage: {
            input_tokens: 1,
            output_tokens: 1,
        },
    };
}

function createMockClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): Anthropic {
    return {
        messages: {
            create:
                create ??
                (async () => {
                    throw new Error('not implemented');
                }),
        },
    } as unknown as Anthropic;
}

function createMockChatClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): AnthropicChatClient {
    return createMockClient(create);
}
