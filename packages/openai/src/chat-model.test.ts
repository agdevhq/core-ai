import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';
import type {
    Response,
    ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import {
    ProviderError,
    StreamAbortedError,
    StructuredOutputValidationError,
    resultToMessage,
} from '@core-ai/core-ai';
import { createOpenAIChatModel } from './chat-model.js';
import {
    toAsyncIterable,
    createPushableAsyncIterable,
} from '@core-ai/testing';

describe('createOpenAIChatModel', () => {
    it('should create model metadata', () => {
        const model = createOpenAIChatModel(createMockClient(), 'gpt-5-mini');

        expect(model.provider).toBe('openai');
        expect(model.modelId).toBe('gpt-5-mini');
    });
});

describe('generate', () => {
    it('should map a text response', async () => {
        const create = vi.fn(async (_request: unknown) => {
            return asResponse({
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Hello!' }],
                    },
                ],
                status: 'completed',
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                    input_tokens_details: { cached_tokens: 0 },
                    output_tokens_details: { reasoning_tokens: 0 },
                    total_tokens: 15,
                },
            });
        });
        const model = createOpenAIChatModel(
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
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-5-mini',
                input: [{ role: 'user', content: 'Hi' }],
            }),
            expect.anything()
        );
    });

    it('should pass the caller abort signal to generate requests', async () => {
        const create = vi.fn(async () =>
            asResponse({
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Hello!' }],
                    },
                ],
                status: 'completed',
            })
        );
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const controller = new AbortController();

        await model.generate({
            messages: [{ role: 'user', content: 'Hi' }],
            signal: controller.signal,
        });

        expect(create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                signal: controller.signal,
            })
        );
    });

    it('should preserve encrypted reasoning content across turns', async () => {
        const create = vi.fn(async (_request: unknown) =>
            asResponse({
                output: [
                    {
                        type: 'reasoning',
                        summary: [{ type: 'summary_text', text: 'thinking' }],
                        encrypted_content: 'enc_abc',
                    },
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Answer' }],
                    },
                ],
                status: 'completed',
            })
        );
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const first = await model.generate({
            messages: [{ role: 'user', content: 'Question 1' }],
            reasoning: { effort: 'high' },
        });

        const secondMessages = [
            { role: 'user' as const, content: 'Question 1' },
            resultToMessage(first),
            { role: 'user' as const, content: 'Question 2' },
        ];

        await model.generate({
            messages: secondMessages,
            reasoning: { effort: 'high' },
        });

        const secondCall = create.mock.calls[1] as [unknown] | undefined;
        const secondRequest = secondCall?.[0] as
            | {
                  input?: Array<{ type?: string; encrypted_content?: string }>;
              }
            | undefined;
        const reasoningItem = secondRequest?.input?.find(
            (item) => item.type === 'reasoning'
        );

        expect(reasoningItem?.encrypted_content).toBe('enc_abc');
    });

    it('should generate a validated structured object', async () => {
        const create = vi.fn(async (_request: unknown) =>
            asResponse({
                output: [
                    {
                        type: 'function_call',
                        call_id: 'tc_1',
                        name: 'weather_schema',
                        arguments: '{"city":"Berlin","temperatureC":21}',
                    },
                ],
                status: 'completed',
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                    input_tokens_details: { cached_tokens: 0 },
                    output_tokens_details: { reasoning_tokens: 0 },
                    total_tokens: 15,
                },
            })
        );
        const model = createOpenAIChatModel(
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
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                tool_choice: {
                    type: 'function',
                    name: 'weather_schema',
                },
            }),
            expect.anything()
        );
    });

    it('should pass the caller abort signal to generateObject requests', async () => {
        const create = vi.fn(async (_request: unknown) =>
            asResponse({
                output: [
                    {
                        type: 'function_call',
                        call_id: 'tc_1',
                        name: 'weather_schema',
                        arguments: '{"city":"Berlin","temperatureC":21}',
                    },
                ],
                status: 'completed',
            })
        );
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });
        const controller = new AbortController();

        await model.generateObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
            signal: controller.signal,
        });

        expect(create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                signal: controller.signal,
            })
        );
    });

    it('should throw validation error for invalid structured output', async () => {
        const create = vi.fn(async (_request: unknown) =>
            asResponse({
                output: [
                    {
                        type: 'function_call',
                        call_id: 'tc_1',
                        name: 'weather_schema',
                        arguments: '{"city":"Berlin","temperatureC":"warm"}',
                    },
                ],
                status: 'completed',
            })
        );
        const model = createOpenAIChatModel(
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
        const create = vi.fn(async (_request: unknown) => {
            throw new Error('network failed');
        });
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
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
        const create = vi.fn(async (_request: unknown) =>
            toAsyncIterable<ResponseStreamEvent>([
                asStreamEvent({
                    type: 'response.output_text.delta',
                    delta: 'Hello ',
                }),
                asStreamEvent({
                    type: 'response.output_text.delta',
                    delta: 'world',
                }),
                asStreamEvent({
                    type: 'response.completed',
                    response: asResponse({
                        output: [],
                        status: 'completed',
                        usage: {
                            input_tokens: 10,
                            output_tokens: 2,
                            input_tokens_details: { cached_tokens: 0 },
                            output_tokens_details: { reasoning_tokens: 0 },
                            total_tokens: 12,
                        },
                    }),
                }),
            ])
        );
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );

        const chatStream = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const events: string[] = [];
        for await (const event of chatStream) {
            if (event.type === 'text-delta') {
                events.push(event.text);
            }
        }

        expect(events.join('')).toBe('Hello world');
        const response = await chatStream.result;
        expect(response.content).toBe('Hello world');
        expect(response.finishReason).toBe('stop');
    });

    it('should reject iteration and result on abort while preserving partial events', async () => {
        const source = createPushableAsyncIterable<ResponseStreamEvent>();
        const create = vi.fn(async () => source.iterable);
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const controller = new AbortController();
        const chatStream = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
            signal: controller.signal,
        });
        const resultRejection = expect(chatStream.result).rejects.toBeInstanceOf(
            StreamAbortedError
        );

        const consumeStream = (async () => {
            for await (const event of chatStream) {
                if (event.type === 'text-delta') {
                    controller.abort();
                }
            }
        })();

        source.push(
            asStreamEvent({
                type: 'response.output_text.delta',
                delta: 'partial',
            })
        );

        await expect(consumeStream).rejects.toBeInstanceOf(StreamAbortedError);
        await resultRejection;
        await expect(chatStream.events).resolves.toEqual([
            {
                type: 'text-delta',
                text: 'partial',
            },
        ]);
    });
});

describe('streamObject', () => {
    it('should stream and validate a structured object', async () => {
        const create = vi.fn(async () =>
            toAsyncIterable<ResponseStreamEvent>([
                asStreamEvent({
                    type: 'response.output_item.added',
                    output_index: 0,
                    item: {
                        type: 'function_call',
                        call_id: 'tc_1',
                        name: 'weather_schema',
                        arguments: '',
                    },
                }),
                asStreamEvent({
                    type: 'response.function_call_arguments.delta',
                    output_index: 0,
                    item_id: 'item_1',
                    delta: '{"city":"Berlin",',
                }),
                asStreamEvent({
                    type: 'response.function_call_arguments.delta',
                    output_index: 0,
                    item_id: 'item_1',
                    delta: '"temperatureC":21}',
                }),
                asStreamEvent({
                    type: 'response.output_item.done',
                    output_index: 0,
                    item: {
                        type: 'function_call',
                        call_id: 'tc_1',
                        name: 'weather_schema',
                        arguments: '{"city":"Berlin","temperatureC":21}',
                    },
                }),
                asStreamEvent({
                    type: 'response.completed',
                    response: asResponse({
                        output: [],
                        status: 'completed',
                        usage: {
                            input_tokens: 10,
                            output_tokens: 5,
                            input_tokens_details: { cached_tokens: 0 },
                            output_tokens_details: { reasoning_tokens: 0 },
                            total_tokens: 15,
                        },
                    }),
                }),
            ])
        );
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const objectStream = await model.streamObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        const objects: Array<{ city: string; temperatureC: number }> = [];
        for await (const event of objectStream) {
            if (event.type === 'object') {
                objects.push(event.object);
            }
        }

        expect(objects).toEqual([{ city: 'Berlin', temperatureC: 21 }]);
        const response = await objectStream.result;
        expect(response.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(response.finishReason).toBe('tool-calls');
    });

    it('should reject iteration and result on abort while preserving partial events', async () => {
        const source = createPushableAsyncIterable<ResponseStreamEvent>();
        const create = vi.fn(async () => source.iterable);
        const model = createOpenAIChatModel(
            createMockClient(create),
            'gpt-5-mini'
        );
        const controller = new AbortController();
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });
        const objectStream = await model.streamObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
            signal: controller.signal,
        });
        const resultRejection = expect(
            objectStream.result
        ).rejects.toBeInstanceOf(StreamAbortedError);

        const consumeStream = (async () => {
            for await (const event of objectStream) {
                if (event.type === 'object-delta') {
                    controller.abort();
                }
            }
        })();

        source.push(
            asStreamEvent({
                type: 'response.output_item.added',
                output_index: 0,
                item: {
                    type: 'function_call',
                    call_id: 'tc_1',
                    name: 'weather_schema',
                    arguments: '',
                },
            })
        );
        source.push(
            asStreamEvent({
                type: 'response.function_call_arguments.delta',
                output_index: 0,
                item_id: 'item_1',
                delta: '{"city":"Berlin"',
            })
        );

        await expect(consumeStream).rejects.toBeInstanceOf(StreamAbortedError);
        await resultRejection;
        await expect(objectStream.events).resolves.toEqual([
            {
                type: 'object-delta',
                text: '{"city":"Berlin"',
            },
        ]);
    });
});

function createMockClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
): Pick<OpenAI, 'responses'> {
    return {
        responses: {
            create:
                create ??
                (async () => {
                    throw new Error('not implemented');
                }),
        },
    } as unknown as Pick<OpenAI, 'responses'>;
}

function asResponse(value: unknown): Response {
    return value as Response;
}

function asStreamEvent(value: unknown): ResponseStreamEvent {
    return value as ResponseStreamEvent;
}
