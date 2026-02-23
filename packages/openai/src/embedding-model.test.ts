import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { createOpenAIEmbeddingModel } from './embedding-model.js';

describe('createOpenAIEmbeddingModel', () => {
    it('should embed a single string', async () => {
        const create = vi.fn(async () => ({
            data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
            usage: { prompt_tokens: 5, total_tokens: 5 },
        }));

        const model = createOpenAIEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<OpenAI, 'embeddings'>,
            'text-embedding-3-small'
        );

        const result = await model.embed({ input: 'Hello world' });

        expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(result.usage.inputTokens).toBe(5);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'text-embedding-3-small',
                input: 'Hello world',
            })
        );
    });

    it('should embed multiple strings', async () => {
        const create = vi.fn(async () => ({
            data: [
                { embedding: [0.3, 0.4], index: 1 },
                { embedding: [0.1, 0.2], index: 0 },
            ],
            usage: { prompt_tokens: 10, total_tokens: 10 },
        }));

        const model = createOpenAIEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<OpenAI, 'embeddings'>,
            'text-embedding-3-small'
        );

        const result = await model.embed({ input: ['Hello', 'World'] });

        expect(result.embeddings).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
    });

    it('should pass dimensions option', async () => {
        const create = vi.fn(async () => ({
            data: [{ embedding: [0.1], index: 0 }],
            usage: { prompt_tokens: 5, total_tokens: 5 },
        }));

        const model = createOpenAIEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<OpenAI, 'embeddings'>,
            'text-embedding-3-small'
        );

        await model.embed({ input: 'test', dimensions: 256 });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ dimensions: 256 })
        );
    });
});
