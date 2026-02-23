import { describe, expect, it, vi } from 'vitest';
import type { Mistral } from '@mistralai/mistralai';
import { ProviderError } from '@core-ai/core-ai';
import { createMistralEmbeddingModel } from './embedding-model.js';

describe('createMistralEmbeddingModel', () => {
    it('should embed a single string', async () => {
        const create = vi.fn(async () => ({
            id: 'embed-1',
            object: 'list',
            model: 'mistral-embed',
            usage: { promptTokens: 5, totalTokens: 5 },
            data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        }));

        const model = createMistralEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<Mistral, 'embeddings'>,
            'mistral-embed'
        );

        const result = await model.embed({ input: 'Hello world' });

        expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(result.usage.inputTokens).toBe(5);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'mistral-embed',
                inputs: 'Hello world',
            })
        );
    });

    it('should embed multiple strings', async () => {
        const create = vi.fn(async () => ({
            id: 'embed-1',
            object: 'list',
            model: 'mistral-embed',
            usage: { promptTokens: 10, totalTokens: 10 },
            data: [
                { embedding: [0.3, 0.4], index: 1 },
                { embedding: [0.1, 0.2], index: 0 },
            ],
        }));

        const model = createMistralEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<Mistral, 'embeddings'>,
            'mistral-embed'
        );

        const result = await model.embed({ input: ['Hello', 'World'] });

        expect(result.embeddings).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
    });

    it('should pass dimensions option', async () => {
        const create = vi.fn(async () => ({
            id: 'embed-1',
            object: 'list',
            model: 'mistral-embed',
            usage: { promptTokens: 5, totalTokens: 5 },
            data: [{ embedding: [0.1], index: 0 }],
        }));

        const model = createMistralEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<Mistral, 'embeddings'>,
            'mistral-embed'
        );

        await model.embed({ input: 'test', dimensions: 256 });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ outputDimension: 256 })
        );
    });

    it('should wrap provider errors', async () => {
        const create = vi.fn(async () => {
            throw new Error('network failed');
        });

        const model = createMistralEmbeddingModel(
            {
                embeddings: { create },
            } as unknown as Pick<Mistral, 'embeddings'>,
            'mistral-embed'
        );

        await expect(model.embed({ input: 'test' })).rejects.toBeInstanceOf(
            ProviderError
        );
    });
});
