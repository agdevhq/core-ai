import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors.ts';
import { stream } from './stream-chat.ts';
import type { ChatModel, ChatOutputTokenDetails, ChatStream } from './types.ts';

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
        outputTokenDetails: ChatOutputTokenDetails;
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
            outputTokenDetails: {},
        },
    };
}

function createMockChatStream(): ChatStream {
    const iterable = events();
    return {
        [Symbol.asyncIterator]() {
            return iterable[Symbol.asyncIterator]();
        },
        result: Promise.resolve({
            parts: [],
            content: null,
            reasoning: null,
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
        }),
        events: Promise.resolve([]),
    };
}

describe('stream', () => {
    it('should delegate to model.stream', async () => {
        const expected = createMockChatStream();
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            capabilities: {
                reasoning: {
                    mode: 'unsupported',
                    supportedEfforts: [],
                    restrictsSamplingParams: false,
                    supportedToolChoices: ['auto', 'none', 'required', 'tool'],
                },
            },
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

        const chatStream = await stream({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(chatStream).toBe(expected);
        expect(model.stream).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'Hi' }],
        });
    });

    it('should throw ValidationError for empty messages', async () => {
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            capabilities: {
                reasoning: {
                    mode: 'unsupported',
                    supportedEfforts: [],
                    restrictsSamplingParams: false,
                    supportedToolChoices: ['auto', 'none', 'required', 'tool'],
                },
            },
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => createMockChatStream()),
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
        ).rejects.toBeInstanceOf(ValidationError);
    });
});
