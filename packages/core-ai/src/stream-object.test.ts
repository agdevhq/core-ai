import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMError } from './errors.ts';
import { createObjectStreamResult, streamObject } from './stream-object.ts';
import type {
    ChatModel,
    ObjectStreamEvent,
    StreamObjectResult,
} from './types.ts';

const weatherSchema = z.object({
    city: z.string(),
    temperatureC: z.number(),
});

function createMockStreamObjectResult(): StreamObjectResult<
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
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            },
        },
    ];

    const iterable = createObjectStreamResult(toAsyncIterable(events));
    return iterable;
}

describe('streamObject', () => {
    it('should delegate to model.streamObject', async () => {
        const expected = createMockStreamObjectResult();
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

        const result = await streamObject({
            model,
            messages: [{ role: 'user', content: 'return weather json' }],
            schema: weatherSchema,
        });

        expect(result).toBe(expected);
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

describe('createObjectStreamResult', () => {
    it('should aggregate the latest object via toResponse()', async () => {
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
                    outputTokenDetails: {
                        reasoningTokens: 0,
                    },
                },
            },
        ];

        const result = createObjectStreamResult(toAsyncIterable(events));
        const response = await result.toResponse();

        expect(response.object).toEqual({
            city: 'Berlin',
            temperatureC: 21,
        });
        expect(response.finishReason).toBe('stop');
    });

    it('should fail toResponse when no object is emitted', async () => {
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
                    outputTokenDetails: {
                        reasoningTokens: 0,
                    },
                },
            },
        ];

        const result = createObjectStreamResult(toAsyncIterable(events));

        await expect(result.toResponse()).rejects.toBeInstanceOf(LLMError);
    });
});

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}
