import { toAsyncIterable } from '@core-ai/testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createChatStream } from './stream.ts';
import { createObjectStream } from './stream-object.ts';
import { wrapChatModel } from './wrap-chat-model.ts';
import type {
    ChatModel,
    ChatStream,
    GenerateObjectResult,
    GenerateResult,
    ObjectStream,
    ObjectStreamEvent,
    StreamEvent,
    StreamObjectOptions,
} from './types.ts';

function createChatUsage(): GenerateResult['usage'] {
    return {
        inputTokens: 1,
        outputTokens: 1,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };
}

function createGenerateResult(content: string): GenerateResult {
    return {
        parts: [{ type: 'text', text: content }],
        content,
        reasoning: null,
        toolCalls: [],
        finishReason: 'stop',
        usage: createChatUsage(),
    };
}

function createMockChatStream(text: string): ChatStream {
    const events: StreamEvent[] = [
        { type: 'text-delta', text },
        {
            type: 'finish',
            finishReason: 'stop',
            usage: createChatUsage(),
        },
    ];

    return createChatStream(toAsyncIterable(events));
}

function createMockObjectStream<TSchema extends z.ZodType>(
    options: StreamObjectOptions<TSchema>,
    object: z.infer<TSchema>
): ObjectStream<TSchema> {
    const events: ObjectStreamEvent<TSchema>[] = [
        {
            type: 'object',
            object,
        },
        {
            type: 'finish',
            finishReason: 'stop',
            usage: createChatUsage(),
        },
    ];

    return createObjectStream(toAsyncIterable(events), {
        signal: options.signal,
    });
}

function createMockChatModel(): {
    model: ChatModel;
    generateMock: ReturnType<typeof vi.fn<ChatModel['generate']>>;
    streamMock: ReturnType<typeof vi.fn<ChatModel['stream']>>;
    generateObjectMock: ChatModel['generateObject'];
    streamObjectMock: ChatModel['streamObject'];
} {
    const generateMock = vi.fn<ChatModel['generate']>(async (options) => {
        const firstMessage = options.messages[0];
        const content =
            firstMessage?.role === 'user' &&
            typeof firstMessage.content === 'string'
                ? firstMessage.content
                : 'default';

        return createGenerateResult(content);
    });
    const streamMock = vi.fn<ChatModel['stream']>(async () =>
        createMockChatStream('hello')
    );
    const generateObjectMock = vi.fn(
        async <TSchema extends z.ZodType>(
            options: StreamObjectOptions<TSchema>
        ) =>
            ({
                object: {
                    schemaName: options.schemaName ?? 'unknown',
                },
                finishReason: 'stop',
                usage: createChatUsage(),
            }) as GenerateObjectResult<TSchema>
    ) as ChatModel['generateObject'];
    const streamObjectMock = vi.fn(
        async <TSchema extends z.ZodType>(
            options: StreamObjectOptions<TSchema>
        ) =>
            createMockObjectStream(options, {
                city: 'Berlin',
                temperatureC: 21,
            } as z.infer<TSchema>)
    ) as ChatModel['streamObject'];

    return {
        model: {
            provider: 'test',
            modelId: 'test-model',
            capabilities: {
                reasoning: {
                    supported: false,
                    supportedEfforts: [],
                    restrictsSamplingParams: false,
                },
            },
            generate: generateMock,
            stream: streamMock,
            generateObject: generateObjectMock,
            streamObject: streamObjectMock,
        },
        generateMock,
        streamMock,
        generateObjectMock,
        streamObjectMock,
    };
}

describe('wrapChatModel', () => {
    it('passes through to the original model when no hooks are defined', async () => {
        const {
            model,
            generateMock,
            streamMock,
            generateObjectMock,
            streamObjectMock,
        } = createMockChatModel();
        const schema = z.object({
            city: z.string(),
            temperatureC: z.number(),
        });
        const wrapped = wrapChatModel({
            model,
            middleware: {},
        });

        const generateResult = await wrapped.generate({
            messages: [{ role: 'user', content: 'hello' }],
        });
        const chatStream = await wrapped.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });
        const objectResult = await wrapped.generateObject({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
        });
        const objectStream = await wrapped.streamObject({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
        });

        expect(wrapped.provider).toBe(model.provider);
        expect(wrapped.modelId).toBe(model.modelId);
        expect(wrapped.capabilities).toBe(model.capabilities);
        expect(generateResult.content).toBe('hello');
        expect(await chatStream.result).toMatchObject({ content: 'hello' });
        expect(objectResult.object).toEqual({ schemaName: 'unknown' });
        expect(await objectStream.result).toMatchObject({
            object: { city: 'Berlin', temperatureC: 21 },
        });
        expect(generateMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
        });
        expect(streamMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
        });
        expect(generateObjectMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
        });
        expect(streamObjectMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
        });
    });

    it('allows generate middleware to observe and return the result unchanged', async () => {
        const { model } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute, options, model }) => {
                    expect(options.messages).toEqual([
                        { role: 'user', content: 'hello' },
                    ]);
                    expect(model.modelId).toBe('test-model');
                    return execute();
                },
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).resolves.toMatchObject({
            content: 'hello',
        });
    });

    it('allows generate middleware to modify options via execute', async () => {
        const { model, generateMock } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: ({ execute, options }) =>
                    execute({
                        ...options,
                        messages: [{ role: 'user', content: 'rewritten' }],
                    }),
            },
        });

        const result = await wrapped.generate({
            messages: [{ role: 'user', content: 'original' }],
        });

        expect(result.content).toBe('rewritten');
        expect(generateMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'rewritten' }],
        });
    });

    it('allows generate middleware to modify the result', async () => {
        const { model } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute }) => {
                    const result = await execute();
                    return {
                        ...result,
                        content: result.content?.toUpperCase() ?? null,
                    };
                },
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).resolves.toMatchObject({
            content: 'HELLO',
        });
    });

    it('allows generate middleware to retry', async () => {
        const { model, generateMock } = createMockChatModel();
        let attempts = 0;
        generateMock.mockImplementation(async (options) => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('temporary');
            }

            const firstMessage = options.messages[0];

            return createGenerateResult(
                firstMessage?.role === 'user' &&
                    typeof firstMessage.content === 'string'
                    ? firstMessage.content
                    : 'ok'
            );
        });

        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute }) => {
                    try {
                        return await execute();
                    } catch {
                        return execute();
                    }
                },
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'retry-success' }],
            })
        ).resolves.toMatchObject({
            content: 'retry-success',
        });
        expect(generateMock).toHaveBeenCalledTimes(2);
    });

    it('allows generate middleware to short-circuit', async () => {
        const { model, generateMock } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async () => createGenerateResult('cached'),
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'ignored' }],
            })
        ).resolves.toMatchObject({
            content: 'cached',
        });
        expect(generateMock).not.toHaveBeenCalled();
    });

    it('allows stream middleware to wrap the returned stream', async () => {
        const { model } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                stream: async ({ execute }) => {
                    const original = await execute();

                    return createChatStream(
                        (async function* () {
                            for await (const event of original) {
                                if (event.type === 'text-delta') {
                                    yield {
                                        ...event,
                                        text: event.text.toUpperCase(),
                                    };
                                    continue;
                                }

                                yield event;
                            }
                        })()
                    );
                },
            },
        });

        const result = await (
            await wrapped.stream({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).result;

        expect(result.content).toBe('HELLO');
    });

    it('allows generateObject middleware to modify options', async () => {
        const { model, generateObjectMock } = createMockChatModel();
        const schema = z.object({
            schemaName: z.string(),
        });
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generateObject: ({ execute, options }) =>
                    execute({
                        ...options,
                        schemaName: 'rewritten-schema',
                    }),
            },
        });

        const result = await wrapped.generateObject({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
        });

        expect(result.object).toEqual({ schemaName: 'rewritten-schema' });
        expect(generateObjectMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
            schema,
            schemaName: 'rewritten-schema',
        });
    });

    it('composes multiple middleware in order', async () => {
        const { model } = createMockChatModel();
        const order: string[] = [];
        const wrapped = wrapChatModel({
            model,
            middleware: [
                {
                    generate: async ({ execute }) => {
                        order.push('a-before');
                        const result = await execute();
                        order.push('a-after');
                        return result;
                    },
                },
                {
                    generate: async ({ execute }) => {
                        order.push('b-before');
                        const result = await execute();
                        order.push('b-after');
                        return result;
                    },
                },
            ],
        });

        await wrapped.generate({
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(order).toEqual(['a-before', 'b-before', 'b-after', 'a-after']);
    });

    it('exposes model errors to middleware', async () => {
        const { model, generateMock } = createMockChatModel();
        const errors: string[] = [];
        generateMock.mockRejectedValueOnce(new Error('boom'));
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute }) => {
                    try {
                        return await execute();
                    } catch (error) {
                        errors.push(
                            error instanceof Error ? error.message : 'unknown'
                        );
                        throw error;
                    }
                },
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toThrow('boom');
        expect(errors).toEqual(['boom']);
    });

    it('applies a single middleware with multiple hooks to different operations', async () => {
        const { model, generateMock, streamMock } = createMockChatModel();
        const calls: string[] = [];
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute }) => {
                    calls.push('generate');
                    return execute();
                },
                stream: async ({ execute }) => {
                    calls.push('stream');
                    return execute();
                },
            },
        });

        await wrapped.generate({
            messages: [{ role: 'user', content: 'hello' }],
        });
        await wrapped.stream({
            messages: [{ role: 'user', content: 'hello' }],
        });

        expect(calls).toEqual(['generate', 'stream']);
        expect(generateMock).toHaveBeenCalledTimes(1);
        expect(streamMock).toHaveBeenCalledTimes(1);
    });

    it('passes metadata through to both middleware and the underlying model', async () => {
        const { model, generateMock } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async ({ execute, options }) => {
                    expect(options.metadata).toEqual({ functionId: 'test' });
                    return execute();
                },
            },
        });

        await wrapped.generate({
            messages: [{ role: 'user', content: 'hello' }],
            metadata: { functionId: 'test' },
        });

        expect(generateMock).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'hello' }],
            metadata: { functionId: 'test' },
        });
    });

    it('propagates hook errors to the caller', async () => {
        const { model, generateMock } = createMockChatModel();
        const wrapped = wrapChatModel({
            model,
            middleware: {
                generate: async () => {
                    throw new Error('middleware failed');
                },
            },
        });

        await expect(
            wrapped.generate({
                messages: [{ role: 'user', content: 'hello' }],
            })
        ).rejects.toThrow('middleware failed');
        expect(generateMock).not.toHaveBeenCalled();
    });
});
