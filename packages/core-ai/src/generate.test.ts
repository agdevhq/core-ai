import { describe, expect, it, vi } from 'vitest';
import { LLMError } from './errors.ts';
import { generate } from './generate.ts';
import type { ChatModel, GenerateResult } from './types.ts';

function createMockChatModel(result: GenerateResult): ChatModel {
    return {
        provider: 'test',
        modelId: 'test-model',
        generate: vi.fn(async () => result),
        stream: vi.fn(async () => {
            throw new Error('not implemented');
        }),
        generateObject: vi.fn(async () => {
            throw new Error('not implemented');
        }),
        streamObject: vi.fn(async () => {
            throw new Error('not implemented');
        }),
    };
}

describe('generate', () => {
    it('should delegate to model.generate', async () => {
        const expected: GenerateResult = {
            content: 'Hello',
            toolCalls: [],
            finishReason: 'stop',
            usage: {
                inputTokens: 5,
                outputTokens: 3,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            },
        };
        const model = createMockChatModel(expected);

        const result = await generate({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result).toEqual(expected);
    });

    it('should throw LLMError for empty messages', async () => {
        const model = createMockChatModel({
            content: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {
                    reasoningTokens: 0,
                },
            },
        });

        await expect(
            generate({
                model,
                messages: [],
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});
