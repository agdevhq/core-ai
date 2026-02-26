import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LLMError } from './errors.ts';
import { generateObject } from './generate-object.ts';
import type { ChatModel } from './types.ts';

describe('generateObject', () => {
    it('should delegate to model.generateObject', async () => {
        const schema = z.object({
            answer: z.string(),
        });
        const expected = {
            object: { answer: '42' },
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
        } as const;

        const generateObjectMock = vi.fn(async () => expected);
        const model: ChatModel = {
            provider: 'test',
            modelId: 'test-model',
            generate: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            stream: vi.fn(async () => {
                throw new Error('not implemented');
            }),
            generateObject: generateObjectMock as ChatModel['generateObject'],
            streamObject: vi.fn(async () => {
                throw new Error('not implemented');
            }),
        };

        const result = await generateObject({
            model,
            messages: [{ role: 'user', content: 'answer with json' }],
            schema,
        });

        expect(result).toEqual(expected);
        expect(generateObjectMock).toHaveBeenCalledTimes(1);
    });

    it('should throw LLMError for empty messages', async () => {
        const schema = z.object({
            answer: z.string(),
        });
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
            }),
        };

        await expect(
            generateObject({
                model,
                messages: [],
                schema,
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});
