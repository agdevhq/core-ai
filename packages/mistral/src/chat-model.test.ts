import { describe, expect, it, vi } from 'vitest';
import type { Mistral } from '@mistralai/mistralai';
import type {
    ChatCompletionResponse,
    CompletionEvent,
} from '@mistralai/mistralai/models/components';
import { ProviderError } from '@core-ai/core-ai';
import { createMistralChatModel } from './chat-model.js';

describe('createMistralChatModel', () => {
    it('should create model metadata', () => {
        const model = createMistralChatModel(
            createMockClient(),
            'mistral-large-latest'
        );

        expect(model.provider).toBe('mistral');
        expect(model.modelId).toBe('mistral-large-latest');
    });
});

describe('generate', () => {
    it('should map a text response', async () => {
        const complete = vi.fn(async () => {
            return asChatCompletionResponse({
                choices: [
                    {
                        index: 0,
                        finishReason: 'stop',
                        message: {
                            role: 'assistant',
                            content: 'Hello!',
                        },
                    },
                ],
                usage: {
                    promptTokens: 10,
                    completionTokens: 5,
                    totalTokens: 15,
                },
            });
        });
        const model = createMistralChatModel(
            createMockClient({ complete }),
            'mistral-large-latest'
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

        expect(complete).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'mistral-large-latest',
                messages: [{ role: 'user', content: 'Hi' }],
            })
        );
    });

    it('should map tool call responses', async () => {
        const complete = vi.fn(async () => {
            return asChatCompletionResponse({
                choices: [
                    {
                        index: 0,
                        finishReason: 'tool_calls',
                        message: {
                            role: 'assistant',
                            content: null,
                            toolCalls: [
                                {
                                    id: 'tc_1',
                                    type: 'function',
                                    function: {
                                        name: 'search',
                                        arguments: '{"query":"weather"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    promptTokens: 10,
                    completionTokens: 20,
                    totalTokens: 30,
                },
            });
        });
        const model = createMistralChatModel(
            createMockClient({ complete }),
            'mistral-large-latest'
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'weather?' }],
        });

        expect(result.finishReason).toBe('tool-calls');
        expect(result.toolCalls).toEqual([
            {
                id: 'tc_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
    });

    it('should wrap provider errors', async () => {
        const complete = vi.fn(async () => {
            throw new Error('network failed');
        });
        const model = createMistralChatModel(
            createMockClient({ complete }),
            'mistral-large-latest'
        );

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(ProviderError);
    });
});

describe('stream', () => {
    it('should stream content and aggregate response', async () => {
        const stream = vi.fn(async () => {
            return toAsyncIterable<CompletionEvent>([
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: null,
                            delta: { content: 'Hello ' },
                        },
                    ],
                }),
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: 'stop',
                            delta: { content: 'world' },
                        },
                    ],
                    usage: {
                        promptTokens: 10,
                        completionTokens: 2,
                        totalTokens: 12,
                    },
                }),
            ]);
        });
        const model = createMistralChatModel(
            createMockClient({ stream }),
            'mistral-large-latest'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const events: string[] = [];
        for await (const event of streamResult) {
            if (event.type === 'content-delta') {
                events.push(event.text);
            }
        }

        expect(events.join('')).toBe('Hello world');
        const response = await streamResult.toResponse();
        expect(response.content).toBe('Hello world');
        expect(response.finishReason).toBe('stop');
        expect(response.usage).toEqual({
            inputTokens: 10,
            outputTokens: 2,
            reasoningTokens: 0,
            totalTokens: 12,
        });
    });

    it('should emit tool call events in stream', async () => {
        const stream = vi.fn(async () => {
            return toAsyncIterable<CompletionEvent>([
                asCompletionEvent({
                    choices: [
                        {
                            index: 0,
                            finishReason: 'tool_calls',
                            delta: {
                                toolCalls: [
                                    {
                                        id: 'tc_1',
                                        type: 'function',
                                        index: 0,
                                        function: {
                                            name: 'search',
                                            arguments: '{"query":"weather"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            ]);
        });
        const model = createMistralChatModel(
            createMockClient({ stream }),
            'mistral-large-latest'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'weather?' }],
        });

        const events = [];
        for await (const event of streamResult) {
            events.push(event);
        }

        expect(events.some((event) => event.type === 'tool-call-start')).toBe(
            true
        );
        expect(events.some((event) => event.type === 'tool-call-end')).toBe(true);

        const response = await streamResult.toResponse();
        expect(response.finishReason).toBe('tool-calls');
        expect(response.toolCalls).toEqual([
            {
                id: 'tc_1',
                name: 'search',
                arguments: { query: 'weather' },
            },
        ]);
    });
});

function createMockClient(
    overrides?: {
        complete?: (options: unknown) => Promise<unknown>;
        stream?: (options: unknown) => Promise<unknown>;
    }
): Pick<Mistral, 'chat'> {
    const complete =
        overrides?.complete ??
        (async () => {
            throw new Error('chat complete not implemented');
        });
    const stream =
        overrides?.stream ??
        (async () => {
            throw new Error('chat stream not implemented');
        });

    return {
        chat: {
            complete,
            stream,
        },
    } as unknown as Pick<Mistral, 'chat'>;
}

function asChatCompletionResponse(
    value: Partial<ChatCompletionResponse>
): ChatCompletionResponse {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        model: 'mistral-large-latest',
        usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
        },
        created: Date.now(),
        choices: [],
        ...value,
    };
}

function asCompletionEvent(value: {
    choices: Array<{
        index: number;
        finishReason: string | null;
        delta: {
            content?: string | null;
            toolCalls?: Array<{
                id?: string;
                type?: string;
                index?: number;
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
    }>;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}): CompletionEvent {
    return {
        data: {
            id: 'chunk-1',
            model: 'mistral-large-latest',
            choices: value.choices as CompletionEvent['data']['choices'],
            ...(value.usage ? { usage: value.usage } : {}),
        },
    };
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
