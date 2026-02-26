import { describe, expect, it, vi } from 'vitest';
import { LLMError } from './errors.ts';
import { stream } from './stream-chat.ts';
import type { ChatModel, StreamResult } from './types.ts';

async function* events(): AsyncIterable<{
    type: 'finish';
    finishReason: 'stop';
    usage: {
        inputTokens: 1;
        outputTokens: 1;
        inputTokenDetails: {
            cacheReadTokens: 0;
            cacheWriteTokens: 0;
        };
        outputTokenDetails: {
            reasoningTokens: 0;
        };
    };
}> {
    yield {
        type: 'finish',
        finishReason: 'stop',
        usage: {
            inputTokens: 1,
            outputTokens: 1,
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        },
    };
}

function createMockStreamResult(): StreamResult {
    const iterable = events();
    return {
        [Symbol.asyncIterator]() {
            return iterable[Symbol.asyncIterator]();
        },
        async toResponse() {
            return {
                content: null,
                toolCalls: [],
                finishReason: 'stop',
                usage: {
                    inputTokens: 1,
                    outputTokens: 1,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                    outputTokenDetails: {
                        reasoningTokens: 0,
                    },
                },
            };
        },
    };
}

describe('stream', () => {
    it('should delegate to model.stream', async () => {
        const expected = createMockStreamResult();
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => expected),
            generateObject: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            streamObject: vi.fn(async () => {
                throw new Error('not implemented');
            }),
        };

        const result = await stream({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result).toBe(expected);
    });

    it('should throw LLMError for empty messages', async () => {
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => createMockStreamResult()),
            generateObject: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            streamObject: vi.fn(async () => {
                throw new Error('not implemented');
            }),
        };

        await expect(
            stream({
                model,
                messages: [],
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});
