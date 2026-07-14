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
            'gemini-embedding-001'
        );

        const result = await model.embed({ input: 'Hello world' });

        expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(result.usage?.inputTokens).toBe(5);
        expect(embedContent).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gemini-embedding-001',
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
            'gemini-embedding-001'
        );

        const result = await model.embed({ input: ['Hello', 'World'] });

        expect(result.embeddings).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
        expect(result.usage?.inputTokens).toBe(4);
    });

    it('should omit usage when token statistics are unavailable', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [{ values: [0.1, 0.2, 0.3] }],
        }));

        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-embedding-001'
        );

        const result = await model.embed({ input: 'Hello world' });

        expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
        expect(result.usage).toBeUndefined();
    });

    it('should pass dimensions and explicit provider options', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [{ values: [0.1] }],
        }));

        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-embedding-001'
        );

        await model.embed({
            input: 'test',
            dimensions: 256,
            providerOptions: {
                google: {
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

    it('should reject raw google config for embeddings', async () => {
        const embedContent = vi.fn(async () => ({
            embeddings: [{ values: [0.1] }],
        }));
        const model = createGoogleGenAIEmbeddingModel(
            {
                models: { embedContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-embedding-001'
        );
        const invalidProviderOptions = {
            google: {
                config: {
                    taskType: 'RETRIEVAL_DOCUMENT',
                },
            },
        } as Parameters<typeof model.embed>[0]['providerOptions'];

        await expect(
            model.embed({
                input: 'test',
                providerOptions: invalidProviderOptions,
            })
        ).rejects.toThrow(/unrecognized_key/);
        expect(embedContent).not.toHaveBeenCalled();
    });
});
