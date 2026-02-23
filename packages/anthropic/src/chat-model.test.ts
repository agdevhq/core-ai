import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type {
    Message,
    RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { ProviderError } from '@core-ai/core-ai';
import { createAnthropicChatModel } from './chat-model.js';

describe('createAnthropicChatModel', () => {
    it('should expose provider metadata', () => {
        const model = createAnthropicChatModel(
            createMockClient(),
            'claude-sonnet-4',
            4096
        );

        expect(model.provider).toBe('anthropic');
        expect(model.modelId).toBe('claude-sonnet-4');
    });
});

describe('generate', () => {
    it('should map text response', async () => {
        const create = vi.fn(async () =>
            asMessage({
                content: [{ type: 'text', text: 'Hello!', citations: null }],
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                },
            })
        );
        const model = createAnthropicChatModel(
            createMockClient(create),
            'claude-sonnet-4',
            4096
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result.content).toBe('Hello!');
        expect(result.toolCalls).toEqual([]);
        expect(result.finishReason).toBe('stop');
        expect(result.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            reasoningTokens: 0,
            totalTokens: 15,
        });
    });

    it('should map tool use response', async () => {
        const create = vi.fn(async () =>
            asMessage({
                content: [
                    {
                        type: 'tool_use',
                        id: 'toolu_1',
                        name: 'search',
                        input: { query: 'weather' },
                        caller: { type: 'direct' },
                    },
                ],
                stop_reason: 'tool_use',
                usage: {
                    input_tokens: 12,
                    output_tokens: 8,
                },
            })
        );
        const model = createAnthropicChatModel(
            createMockClient(create),
            'claude-sonnet-4',
            4096
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'weather?' }],
        });

        expect(result.finishReason).toBe('tool-calls');
        expect(result.toolCalls).toEqual([
            {
                id: 'toolu_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
    });

    it('should wrap provider errors', async () => {
        const create = vi.fn(async () => {
            throw new Error('request failed');
        });
        const model = createAnthropicChatModel(
            createMockClient(create),
            'claude-sonnet-4',
            4096
        );

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(ProviderError);
    });
});

describe('stream', () => {
    it('should stream content and aggregate final response', async () => {
        const create = vi.fn(async () =>
            toAsyncIterable<RawMessageStreamEvent>([
                {
                    type: 'message_start',
                    message: asMessage({
                        content: [],
                        stop_reason: null,
                        usage: {
                            input_tokens: 10,
                            output_tokens: 0,
                        },
                    }),
                },
                {
                    type: 'content_block_start',
                    index: 0,
                    content_block: {
                        type: 'text',
                        text: '',
                        citations: null,
                    },
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'text_delta',
                        text: 'Hello ',
                    },
                },
                {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'text_delta',
                        text: 'world',
                    },
                },
                {
                    type: 'message_delta',
                    delta: {
                        stop_reason: 'end_turn',
                        stop_sequence: null,
                        container: null,
                    },
                    usage: {
                        input_tokens: 10,
                        output_tokens: 2,
                        cache_creation_input_tokens: null,
                        cache_read_input_tokens: null,
                        server_tool_use: null,
                    },
                },
                {
                    type: 'message_stop',
                },
            ])
        );
        const model = createAnthropicChatModel(
            createMockClient(create),
            'claude-sonnet-4',
            4096
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const chunks: string[] = [];
        for await (const event of streamResult) {
            if (event.type === 'content-delta') {
                chunks.push(event.text);
            }
        }

        expect(chunks.join('')).toBe('Hello world');
        const response = await streamResult.toResponse();
        expect(response.content).toBe('Hello world');
        expect(response.finishReason).toBe('stop');
    });
});

function createMockClient(
    create?: (options: unknown) => Promise<unknown>
): Pick<Anthropic, 'messages'> {
    return {
        messages: {
            create:
                create ??
                (async () => {
                    throw new Error('not implemented');
                }),
        },
    } as unknown as Pick<Anthropic, 'messages'>;
}

function asMessage(value: {
    content: unknown[];
    stop_reason: Message['stop_reason'];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}): Message {
    return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        stop_sequence: null,
        container: null,
        content: value.content as Message['content'],
        stop_reason: value.stop_reason,
        usage: {
            input_tokens: value.usage.input_tokens,
            output_tokens: value.usage.output_tokens,
            cache_creation: null,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            service_tier: null,
            output_tokens_details: null,
            input_tokens_details: null,
            cache_creation_tokens: null,
            cache_read_tokens: null,
            total_tokens: null,
            request_id: null,
            inference_geo: null,
        },
    } as unknown as Message;
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
