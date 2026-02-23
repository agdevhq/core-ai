import { describe, expect, it, vi } from 'vitest';
import { LLMError } from './errors.ts';
import { embed } from './embed.ts';
import type { EmbeddingModel } from './types.ts';

describe('embed', () => {
    it('should delegate to model.embed', async () => {
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'test-embed',
            embed: vi.fn(async () => ({
                embeddings: [[0.1, 0.2]],
                usage: { inputTokens: 3 },
            })),
        };

        const result = await embed({
            model,
            input: 'hello',
        });

        expect(result.embeddings).toEqual([[0.1, 0.2]]);
    });

    it('should throw for empty string input', async () => {
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'test-embed',
            embed: vi.fn(async () => ({
                embeddings: [[0.1, 0.2]],
                usage: { inputTokens: 3 },
            })),
        };

        await expect(
            embed({
                model,
                input: '',
            })
        ).rejects.toBeInstanceOf(LLMError);
    });

    it('should throw for empty array input', async () => {
        const model: EmbeddingModel = {
            provider: 'test',
            modelId: 'test-embed',
            embed: vi.fn(async () => ({
                embeddings: [[0.1, 0.2]],
                usage: { inputTokens: 3 },
            })),
        };

        await expect(
            embed({
                model,
                input: [],
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});
