import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { createGoogleGenAIEmbeddingModel } from './embedding-model.js';

describe('createGoogleGenAIEmbeddingModel', () => {
    it('should embed a single string', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [
                {
                    values: [0.1, 0.2, 0.3],
                    statistics: { tokenCount: 5 },
                },
            ],
        }));

        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'text-embedding-004'
        );

        const result = await model.embed({ input: 'Hello world' });

        expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(result.usage.inputTokens).toBe(5);
        expect(embedContent).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'text-embedding-004',
                contents: ['Hello world'],
            })
        );
    });

    it('should embed multiple strings', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [
                { values: [0.1, 0.2], statistics: { tokenCount: 2 } },
                { values: [0.3, 0.4], statistics: { tokenCount: 2 } },
            ],
        }));

        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'text-embedding-004'
        );

        const result = await model.embed({ input: ['Hello', 'World'] });

        expect(result.embeddings).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
        expect(result.usage.inputTokens).toBe(4);
    });

    it('should pass dimensions and provider config options', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [{ values: [0.1] }],
        }));

        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'text-embedding-004'
        );

        await model.embed({
            input: 'test',
            dimensions: 256,
            providerOptions: {
                config: {
                    taskType: 'RETRIEVAL_DOCUMENT',
                },
            },
        });

        expect(embedContent).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    outputDimensionality: 256,
                    taskType: 'RETRIEVAL_DOCUMENT',
                }),
            })
        );
    });
});
