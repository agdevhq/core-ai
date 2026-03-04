import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import type {
    ChatCompletion,
    ChatCompletionChunk,
} from 'openai/resources/chat/completions/completions';
import {
    ProviderError,
    StructuredOutputValidationError,
} from '@core-ai/core-ai';
import { createOpenAICompatChatModel } from './chat-model.js';
import { toAsyncIterable } from '@core-ai/testing';

describe('createOpenAICompatChatModel', () => {
    it('should create model metadata', () => {
        const model = createOpenAICompatChatModel(
            createMockClient(),
            'gpt-5-mini'
        );

        expect(model.provider).toBe('openai');
        expect(model.modelId).toBe('gpt-5-mini');
    });
});

describe('generate', () => {
    it('should map a text response', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: 'Hello!',
                            refusal: null,
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
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
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {},
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-5-mini',
                messages: [{ role: 'user', content: 'Hi' }],
            })
        );
    });

    it('should map cached and reasoning token usage', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: 'Hello from cache!',
                            refusal: null,
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 30,
                    total_tokens: 130,
                    prompt_tokens_details: {
                        cached_tokens: 64,
                        audio_tokens: 0,
                    },
                    completion_tokens_details: {
                        reasoning_tokens: 12,
                        audio_tokens: 0,
                        accepted_prediction_tokens: 0,
                        rejected_prediction_tokens: 0,
                    },
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'Hi again' }],
        });

        expect(result.usage).toEqual({
            inputTokens: 100,
            outputTokens: 30,
            inputTokenDetails: {
                cacheReadTokens: 64,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 12,
            },
        });
    });

    it('should map tool call responses', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'tool_calls',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: null,
                            refusal: null,
                            tool_calls: [
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
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30,
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
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

    it('should generate a validated structured object', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'tool_calls',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: null,
                            refusal: null,
                            tool_calls: [
                                {
                                    id: 'tc_1',
                                    type: 'function',
                                    function: {
                                        name: 'weather_schema',
                                        arguments:
                                            '{"city":"Berlin","temperatureC":21}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const result = await model.generateObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        expect(result.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(result.finishReason).toBe('tool-calls');
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                tool_choice: {
                    type: 'function',
                    function: {
                        name: 'weather_schema',
                    },
                },
            })
        );
    });

    it('should throw validation error for invalid structured output', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'tool_calls',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: null,
                            refusal: null,
                            tool_calls: [
                                {
                                    id: 'tc_1',
                                    type: 'function',
                                    function: {
                                        name: 'weather_schema',
                                        arguments:
                                            '{"city":"Berlin","temperatureC":"warm"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        await expect(
            model.generateObject({
                messages: [{ role: 'user', content: 'Return weather JSON' }],
                schema,
                schemaName: 'weather_schema',
            })
        ).rejects.toBeInstanceOf(StructuredOutputValidationError);
    });

    it('should wrap provider errors', async () => {
        const create = vi.fn(async () => {
            throw new Error('network failed');
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(ProviderError);
    });

    it('should pass reasoning effort in request but not extract reasoning text (Chat Completions API)', async () => {
        const create = vi.fn(async () => {
            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: 'Final answer',
                            refusal: null,
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 7,
                    total_tokens: 19,
                    completion_tokens_details: {
                        reasoning_tokens: 50,
                    },
                },
            });
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const result = await model.generate({
            messages: [{ role: 'user', content: 'Solve this' }],
            reasoning: { effort: 'high' },
        });

        expect(result.reasoning).toBeNull();
        expect(result.usage.outputTokenDetails.reasoningTokens).toBe(50);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                reasoning_effort: 'high',
            })
        );
    });
});

describe('stream', () => {
    it('should stream content and aggregate response', async () => {
        const create = vi.fn(async () => {
            return toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: null,
                            delta: { content: 'Hello ' },
                        },
                    ],
                    usage: null,
                }),
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            delta: { content: 'world' },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 2,
                        total_tokens: 12,
                    },
                }),
            ]);
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const events: string[] = [];
        for await (const event of streamResult) {
            if (event.type === 'text-delta') {
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
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {},
        });
    });

    it('should map cached usage in streaming responses', async () => {
        const create = vi.fn(async () => {
            return toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: null,
                            delta: { content: 'Cache ' },
                        },
                    ],
                    usage: null,
                }),
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            delta: { content: 'hit' },
                        },
                    ],
                    usage: {
                        prompt_tokens: 90,
                        completion_tokens: 4,
                        total_tokens: 94,
                        prompt_tokens_details: {
                            cached_tokens: 64,
                            audio_tokens: 0,
                        },
                        completion_tokens_details: {
                            reasoning_tokens: 1,
                            audio_tokens: 0,
                            accepted_prediction_tokens: 0,
                            rejected_prediction_tokens: 0,
                        },
                    },
                }),
            ]);
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'cached stream' }],
        });

        for await (const _event of streamResult) {
            // Consume stream.
        }

        const response = await streamResult.toResponse();
        expect(response.usage).toEqual({
            inputTokens: 90,
            outputTokens: 4,
            inputTokenDetails: {
                cacheReadTokens: 64,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 1,
            },
        });
    });

    it('should stream and aggregate structured object output', async () => {
        const create = vi.fn(async () => {
            return toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: null,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: 'tc_1',
                                        type: 'function',
                                        function: {
                                            name: 'weather_schema',
                                            arguments: '{"city":"Berlin",',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: null,
                }),
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'tool_calls',
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        type: 'function',
                                        function: {
                                            arguments: '"temperatureC":21}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
            ]);
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const streamResult = await model.streamObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        const objects: Array<{ city: string; temperatureC: number }> = [];
        for await (const event of streamResult) {
            if (event.type === 'object') {
                objects.push(event.object);
            }
        }

        expect(objects).toEqual([{ city: 'Berlin', temperatureC: 21 }]);
        const response = await streamResult.toResponse();
        expect(response.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(response.finishReason).toBe('tool-calls');
    });

    it('should pass reasoning effort in stream request (Chat Completions API)', async () => {
        const create = vi.fn(async () => {
            return toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            delta: { content: 'answer' },
                        },
                    ],
                    usage: {
                        prompt_tokens: 8,
                        completion_tokens: 3,
                        total_tokens: 11,
                        completion_tokens_details: {
                            reasoning_tokens: 1,
                            audio_tokens: 0,
                            accepted_prediction_tokens: 0,
                            rejected_prediction_tokens: 0,
                        },
                    },
                }),
            ]);
        });
        const model = createOpenAICompatChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const streamResult = await model.stream({
            messages: [{ role: 'user', content: 'Explain' }],
            reasoning: { effort: 'medium' },
        });

        const seenEventTypes: string[] = [];
        for await (const event of streamResult) {
            seenEventTypes.push(event.type);
        }

        expect(seenEventTypes).not.toContain('reasoning-start');
        expect(seenEventTypes).toEqual(['text-delta', 'finish']);

        const response = await streamResult.toResponse();
        expect(response.reasoning).toBeNull();
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                reasoning_effort: 'medium',
            })
        );
    });
});

function createMockClient(
    create?: (options: unknown) => Promise<unknown>
): Pick<OpenAI, 'chat'> {
    return {
        chat: {
            completions: {
                create:
                    create ??
                    (async () => {
                        throw new Error('not implemented');
                    }),
            },
        },
    } as unknown as Pick<OpenAI, 'chat'>;
}

function asChatCompletion(value: Partial<ChatCompletion>): ChatCompletion {
    return {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-5-mini',
        choices: [],
        ...value,
    };
}

function asChunk(value: Partial<ChatCompletionChunk>): ChatCompletionChunk {
    return {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-5-mini',
        choices: [],
        ...value,
    };
}

