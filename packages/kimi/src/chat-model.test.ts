import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { APIUserAbortError } from 'openai';
import type OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions/completions';
import {
    AbortedError,
    ProviderError,
    resultToMessage,
} from '@core-ai/core-ai';
import { createKimiChatModel } from './chat-model.ts';
import { getKimiModelCapabilities } from './model-capabilities.ts';
import { toAsyncIterable } from '@core-ai/testing';

type KimiMessage = ChatCompletion['choices'][number]['message'] & {
    reasoning_content?: string;
};

type KimiDelta = NonNullable<ChatCompletionChunk['choices'][number]>['delta'] & {
    reasoning_content?: string;
};

describe('createKimiChatModel', () => {
    it('should create model metadata', () => {
        const model = createKimiChatModel(createMockClient(), 'kimi-k2.7-code');

        expect(model.provider).toBe('kimi');
        expect(model.modelId).toBe('kimi-k2.7-code');
        expect(model.capabilities).toEqual(
            getKimiModelCapabilities('kimi-k2.7-code')
        );
    });
});

describe('generate', () => {
    it('should map reasoning_content and preserve it in follow-up requests', async () => {
        const create = vi.fn(async (request: unknown) => {
            const typedRequest = request as {
                messages: Array<{ reasoning_content?: string }>;
            };
            const hasReasoning = typedRequest.messages.some(
                (message) => message.reasoning_content !== undefined
            );

            if (!hasReasoning) {
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
                                reasoning_content: 'Thinking step',
                            } as KimiMessage,
                        },
                    ],
                });
            }

            expect(typedRequest.messages).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'assistant',
                        reasoning_content: 'Thinking step',
                        content: 'Final answer',
                    }),
                ])
            );

            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: 'Follow up answer',
                            refusal: null,
                        },
                    },
                ],
            });
        });

        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');

        const firstResult = await model.generate({
            messages: [{ role: 'user', content: 'Question' }],
        });

        await model.generate({
            messages: [
                { role: 'user', content: 'Question' },
                resultToMessage(firstResult),
                { role: 'user', content: 'Continue' },
            ],
        });

        expect(firstResult.reasoning).toBe('Thinking step');
        expect(create).toHaveBeenCalledTimes(2);
    });

    it('should wrap provider errors', async () => {
        const create = vi.fn(async () => {
            throw new Error('network failed');
        });
        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(ProviderError);
    });

    it('should map SDK abort errors to AbortedError', async () => {
        const create = vi.fn(async () => {
            throw new APIUserAbortError();
        });
        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');

        await expect(
            model.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toBeInstanceOf(AbortedError);
    });

    it('should generate a validated structured object through JSON mode', async () => {
        const create = vi.fn(async (request: unknown) => {
            expect(request).toMatchObject({
                response_format: { type: 'json_object' },
            });

            return asChatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: 'stop',
                        logprobs: null,
                        message: {
                            role: 'assistant',
                            content: '{"city":"Berlin","temperatureC":21}',
                            refusal: null,
                        },
                    },
                ],
            });
        });
        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');
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
    });

    it('should stream a validated structured object through JSON mode', async () => {
        const create = vi.fn(async (request: unknown) => {
            expect(request).toMatchObject({
                response_format: { type: 'json_object' },
                stream: true,
            });

            return toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: null,
                            delta: { content: '{"city":"Berlin",' },
                        },
                    ],
                }),
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            delta: { content: '"temperatureC":21}' },
                        },
                    ],
                    usage: {
                        prompt_tokens: 5,
                        completion_tokens: 4,
                        total_tokens: 9,
                    },
                }),
            ]);
        });
        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });

        const objectStream = await model.streamObject({
            messages: [{ role: 'user', content: 'Return weather JSON' }],
            schema,
            schemaName: 'weather_schema',
        });

        const objects = [];
        for await (const event of objectStream) {
            if (event.type === 'object') {
                objects.push(event.object);
            }
        }

        expect(objects).toEqual([
            {
                city: 'Berlin',
                temperatureC: 21,
            },
        ]);
    });
});

describe('stream', () => {
    it('should stream reasoning and text deltas', async () => {
        const create = vi.fn(async () =>
            toAsyncIterable<ChatCompletionChunk>([
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: null,
                            delta: { reasoning_content: 'Think' } as KimiDelta,
                        },
                    ],
                }),
                asChunk({
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            delta: { content: 'Answer' },
                        },
                    ],
                    usage: {
                        prompt_tokens: 5,
                        completion_tokens: 2,
                        total_tokens: 7,
                    },
                }),
            ])
        );
        const model = createKimiChatModel(createMockClient(create), 'kimi-k2.7-code');

        const chatStream = await model.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        const eventTypes: string[] = [];
        for await (const event of chatStream) {
            eventTypes.push(event.type);
        }

        expect(eventTypes).toContain('reasoning-delta');
        expect(eventTypes).toContain('text-delta');
        expect((await chatStream.result).content).toBe('Answer');
    });
});

function createMockClient(
    create?: (options: unknown, requestOptions?: unknown) => Promise<unknown>
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
        model: 'kimi-k2.7-code',
        choices: [],
        ...value,
    };
}

function asChunk(value: Partial<ChatCompletionChunk>): ChatCompletionChunk {
    return {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'kimi-k2.7-code',
        choices: [],
        ...value,
    };
}
