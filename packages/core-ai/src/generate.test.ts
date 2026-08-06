import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors.ts';
import { generate } from './generate.ts';
import type { ChatModel, GenerateResult } from './types.ts';

function createMockChatModel(result: GenerateResult): ChatModel {
    return {
        provider: 'test',
        modelId: 'test-model',
        capabilities: {
            reasoning: {
                mode: 'unsupported',
                supportedEfforts: [],
                restrictsSamplingParams: false,
                supportedToolChoices: ['auto', 'none', 'required', 'tool'],
            },
            modalities: {
                imageInput: {
                    supported: true,
                    supportedSources: ['base64', 'url'],
                },
            },
        },
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
            parts: [
                { type: 'text', text: 'Hello', metadata: { checked: true } },
            ],
            content: 'Hello',
            reasoning: null,
            toolCalls: [],
            finishReason: 'stop',
            usage: {
                inputTokens: 5,
                outputTokens: 3,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        };
        const model = createMockChatModel(expected);

        const result = await generate({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result).toEqual(expected);
        expect(result.parts).toEqual([
            { type: 'text', text: 'Hello', metadata: { checked: true } },
        ]);
        expect(model.generate).toHaveBeenCalledWith({
            messages: [{ role: 'user', content: 'Hi' }],
        });
    });

    it('should throw ValidationError for empty messages', async () => {
        const model = createMockChatModel({
            parts: [],
            content: null,
            reasoning: null,
            toolCalls: [],
            finishReason: 'unknown',
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                inputTokenDetails: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
                outputTokenDetails: {},
            },
        });

        await expect(
            generate({
                model,
                messages: [],
            })
        ).rejects.toBeInstanceOf(ValidationError);
    });
});
