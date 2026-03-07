import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    toAsyncIterable,
    createPushableAsyncIterable,
} from '@core-ai/testing';
import { LLMError, StreamAbortedError } from './errors.ts';
import { createObjectStream, streamObject } from './stream-object.ts';
import type {
    ChatModel,
    ObjectStreamEvent,
    ObjectStream,
} from './types.ts';

const weatherSchema = z.object({
    city: z.string(),
    temperatureC: z.number(),
});

function createMockObjectStream(): ObjectStream<
    typeof weatherSchema
> {
    const events: ObjectStreamEvent<typeof weatherSchema>[] = [
        {
            type: 'object',
            object: { city: 'Berlin', temperatureC: 21 },
        },
        {
            type: 'finish',
            finishReason: 'stop',
            usage: {
                inputTokens: 10,
                outputTokens: 5,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        },
    ];

    const iterable = createObjectStream(toAsyncIterable(events));
    return iterable;
}

describe('streamObject', () => {
    it('should delegate to model.streamObject', async () => {
        const expected = createMockObjectStream();
        const streamObjectMock = vi.fn(async () => expected);
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            generateObject: vi.fn(async () => {
                throw new Error('not implemented');
            }) as ChatModel['generateObject'],
            streamObject: streamObjectMock as ChatModel['streamObject'],
        };

        const objectStream = await streamObject({
            model,
            messages: [{ role: 'user', content: 'return weather json' }],
            schema: weatherSchema,
        });

        expect(objectStream).toBe(expected);
        expect(streamObjectMock).toHaveBeenCalledTimes(1);
    });

    it('should throw LLMError for empty messages', async () => {
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            generateObject: vi.fn(async () => {
                throw new Error('not implemented');
            }) as ChatModel['generateObject'],
            streamObject: vi.fn(async () => {
                throw new Error('not implemented');
            }) as ChatModel['streamObject'],
        };

        await expect(
            streamObject({
                model,
                messages: [],
                schema: weatherSchema,
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});

describe('createObjectStream', () => {
    it('should aggregate the latest object via result', async () => {
        const events: ObjectStreamEvent<typeof weatherSchema>[] = [
            { type: 'object-delta', text: '{"city":"Berlin"' },
            {
                type: 'object',
                object: { city: 'Berlin', temperatureC: 21 },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];

        const objectStream = createObjectStream(toAsyncIterable(events));
        const response = await objectStream.result;

        expect(response.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(response.finishReason).toBe('stop');
    });

    it('should allow undefined as a valid final object value', async () => {
        const events: ObjectStreamEvent<z.ZodUndefined>[] = [
            {
                type: 'object',
                object: undefined,
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 1,
                    outputTokens: 0,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];

        const objectStream = createObjectStream(toAsyncIterable(events));

        await expect(objectStream.result).resolves.toEqual({
            object: undefined,
            finishReason: 'stop',
            usage: {
                inputTokens: 1,
                outputTokens: 0,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        });
    });

    it('should reject result when no object is emitted', async () => {
        const events: ObjectStreamEvent<typeof weatherSchema>[] = [
            { type: 'object-delta', text: '{"city":"Berlin"}' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];

        const objectStream = createObjectStream(toAsyncIterable(events));

        await expect(objectStream.result).rejects.toBeInstanceOf(LLMError);
        await expect(objectStream.events).resolves.toEqual(events);
    });

    it('should not emit unhandledRejection when finalizeResult fails and callers only iterate', async () => {
        const events: ObjectStreamEvent<typeof weatherSchema>[] = [
            { type: 'object-delta', text: '{"city":"Berlin"}' },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const objectStream = createObjectStream(toAsyncIterable(events));
        const unhandledRejections: unknown[] = [];
        const handleUnhandledRejection = (reason: unknown) => {
            unhandledRejections.push(reason);
        };
        process.on('unhandledRejection', handleUnhandledRejection);

        try {
            const seenEvents: ObjectStreamEvent<typeof weatherSchema>[] = [];
            await expect(
                (async () => {
                    for await (const event of objectStream) {
                        seenEvents.push(event);
                    }
                })()
            ).rejects.toBeInstanceOf(LLMError);

            expect(seenEvents).toEqual(events);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(unhandledRejections).toEqual([]);
        } finally {
            process.off('unhandledRejection', handleUnhandledRejection);
        }
    });

    it('should replay events after completion', async () => {
        const events: ObjectStreamEvent<typeof weatherSchema>[] = [
            {
                type: 'object',
                object: { city: 'Berlin', temperatureC: 21 },
            },
            {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {},
                },
            },
        ];
        const objectStream = createObjectStream(toAsyncIterable(events));
        const firstPass: ObjectStreamEvent<typeof weatherSchema>[] = [];
        const secondPass: ObjectStreamEvent<typeof weatherSchema>[] = [];

        for await (const event of objectStream) {
            firstPass.push(event);
        }
        for await (const event of objectStream) {
            secondPass.push(event);
        }

        expect(firstPass).toEqual(events);
        expect(secondPass).toEqual(events);
    });

    it('should reject result and iterators on abort while preserving events', async () => {
        const controller = new AbortController();
        const source = createPushableAsyncIterable<
            ObjectStreamEvent<typeof weatherSchema>
        >();
        const objectStream = createObjectStream(source.iterable, {
            signal: controller.signal,
        });

        const iterator = objectStream[Symbol.asyncIterator]();

        source.push({
            type: 'object',
            object: { city: 'Berlin', temperatureC: 21 },
        });

        expect(await iterator.next()).toEqual({
            done: false,
            value: {
                type: 'object',
                object: { city: 'Berlin', temperatureC: 21 },
            },
        });

        controller.abort();

        await expect(objectStream.result).rejects.toBeInstanceOf(StreamAbortedError);
        await expect(objectStream.events).resolves.toEqual([
            {
                type: 'object',
                object: { city: 'Berlin', temperatureC: 21 },
            },
        ]);
        await expect(iterator.next()).rejects.toBeInstanceOf(
            StreamAbortedError
        );
    });
});
