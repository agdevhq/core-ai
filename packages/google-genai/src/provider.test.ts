import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';
import { createGoogleGenAI, createGoogleGenAIProvider } from './provider.js';

describe('createGoogleGenAI', () => {
    it('should expose all model factories', () => {
        const provider = createGoogleGenAI({
            client: createMockClient(),
        });

        const chatModel = provider.chatModel('gemini-2.5-flash');
        const embeddingModel = provider.embeddingModel('gemini-embedding-001');
        const imageModel = provider.imageModel('imagen-4.0-generate-001');

        expect(chatModel.provider).toBe('google');
        expect(chatModel.modelId).toBe('gemini-2.5-flash');

        expect(embeddingModel.provider).toBe('google');
        expect(embeddingModel.modelId).toBe('gemini-embedding-001');

        expect(imageModel.provider).toBe('google');
        expect(imageModel.modelId).toBe('imagen-4.0-generate-001');
    });

    it('should use a shared client instance across model types', async () => {
        const generateContent = vi.fn(async () => ({
            text: 'ok',
            functionCalls: undefined,
            candidates: [
                {
                    finishReason: 'STOP',
                },
            ],
            usageMetadata: {
                promptTokenCount: 1,
                candidatesTokenCount: 1,
                totalTokenCount: 2,
            },
        }));
        const embedContent = vi.fn(async () => ({
            embeddings: [{ values: [0.1], statistics: { tokenCount: 1 } }],
        }));
        const generateImages = vi.fn(async () => ({
            generatedImages: [{ image: { imageBytes: 'abc' } }],
        }));

        const provider = createGoogleGenAI({
            client: createMockClient({
                generateContent,
                embedContent,
                generateImages,
            }),
        });

        await provider
            .chatModel('gemini-2.5-flash')
            .generate({ messages: [{ role: 'user', content: 'hello' }] });
        await provider
            .embeddingModel('gemini-embedding-001')
            .embed({ input: 'hello' });
        await provider
            .imageModel('imagen-4.0-generate-001')
            .generate({ prompt: 'cat' });

        expect(generateContent).toHaveBeenCalledTimes(1);
        expect(embedContent).toHaveBeenCalledTimes(1);
        expect(generateImages).toHaveBeenCalledTimes(1);
    });

    it('should attribute all model types and errors to a custom provider id', async () => {
        const upstreamError = new Error('upstream failure');
        const provider = createGoogleGenAIProvider(
            {
                client: createMockClient({
                    generateContent: async () => {
                        throw upstreamError;
                    },
                    embedContent: async () => {
                        throw upstreamError;
                    },
                    generateImages: async () => {
                        throw upstreamError;
                    },
                }),
            },
            {
                providerId: 'google-vertex',
            }
        );
        const chatModel = provider.chatModel('gemini-2.5-flash');
        const embeddingModel = provider.embeddingModel('gemini-embedding-001');
        const imageModel = provider.imageModel('imagen-4.0-generate-001');

        expect(chatModel.provider).toBe('google-vertex');
        expect(embeddingModel.provider).toBe('google-vertex');
        expect(imageModel.provider).toBe('google-vertex');

        const errors = await Promise.all([
            chatModel
                .generate({ messages: [{ role: 'user', content: 'hello' }] })
                .catch((error: unknown) => error),
            embeddingModel
                .embed({ input: 'hello' })
                .catch((error: unknown) => error),
            imageModel
                .generate({ prompt: 'cat' })
                .catch((error: unknown) => error),
        ]);

        for (const error of errors) {
            expect(error).toBeInstanceOf(ProviderError);
            expect((error as ProviderError).provider).toBe('google-vertex');
        }
    });
});

function createMockClient(overrides?: {
    generateContent?: (options: unknown) => Promise<unknown>;
    embedContent?: (options: unknown) => Promise<unknown>;
    generateImages?: (options: unknown) => Promise<unknown>;
}): GoogleGenAI {
    const generateContent =
        overrides?.generateContent ??
        (async () => {
            throw new Error('generateContent not implemented');
        });
    const embedContent =
        overrides?.embedContent ??
        (async () => {
            throw new Error('embedContent not implemented');
        });
    const generateImages =
        overrides?.generateImages ??
        (async () => {
            throw new Error('generateImages not implemented');
        });

    return {
        models: {
            generateContent,
            generateContentStream: async () => {
                throw new Error('generateContentStream not implemented');
            },
            embedContent,
            generateImages,
        },
    } as unknown as GoogleGenAI;
}
