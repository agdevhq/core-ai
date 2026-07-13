import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import { createAnthropicCompatChatProvider } from './compat.js';
import type { AnthropicChatClient } from './chat-model.js';

describe('createAnthropicCompatChatProvider', () => {
    it('should create a client from apiKey/baseURL when one is not provided', () => {
        const provider = createAnthropicCompatChatProvider({
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

        const provider = createAnthropicCompatChatProvider({
            client: createMockClient(create),
        });

        await provider
            .chatModel('claude-haiku-4-5')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch(() => undefined);

        expect(create).toHaveBeenCalledTimes(1);
    });

    it('should default to 4096 max tokens', async () => {
        const create = vi.fn(async () => createMockResponse());

        const provider = createAnthropicCompatChatProvider({
            client: createMockClient(create),
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

        const provider = createAnthropicCompatChatProvider(
            { client: createMockClient(create) },
            'vertex-anthropic'
        );
        const chatModel = provider.chatModel('claude-sonnet-4-6');

        expect(chatModel.provider).toBe('vertex-anthropic');

        const error = await chatModel
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('vertex-anthropic');
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
): AnthropicChatClient {
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
