import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProviderError, ToolSchemaStrictnessError } from '@core-ai/core-ai';
import type { GoogleGenAIClient } from '@core-ai/google-genai';

import { createGoogleVertex } from './provider.ts';

const {
    googleGenAIConstructor,
    generateContent,
    generateContentStream,
    embedContent,
    generateImages,
} = vi.hoisted(() => ({
    googleGenAIConstructor: vi.fn(),
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    embedContent: vi.fn(),
    generateImages: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    ApiError: class extends Error {
        status = 500;
    },
    GoogleGenAI: class {
        models = {
            generateContent,
            generateContentStream,
            embedContent,
            generateImages,
        };

        constructor(options: unknown) {
            googleGenAIConstructor(options);
        }
    },
}));

describe('createGoogleVertex', () => {
    beforeEach(() => {
        googleGenAIConstructor.mockReset();
        generateContent.mockReset();
        generateContentStream.mockReset();
        embedContent.mockReset();
        generateImages.mockReset();
    });

    it('should throw when projectId is missing and no client is provided', () => {
        expect(() =>
            createGoogleVertex({ region: 'europe-west1' })
        ).toThrowError(/projectId is required/);
        expect(googleGenAIConstructor).not.toHaveBeenCalled();
    });

    it('should throw when region is missing and no client is provided', () => {
        expect(() =>
            createGoogleVertex({ projectId: 'my-project' })
        ).toThrowError(/region is required/);
    });

    it('should construct a Vertex AI client using Application Default Credentials by default', () => {
        createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        expect(googleGenAIConstructor).toHaveBeenCalledWith({
            vertexai: true,
            project: 'my-project',
            location: 'europe-west1',
        });
    });

    it('should pass service account credentials as Google auth options', () => {
        const credentials = {
            client_email: 'test@my-project.iam.gserviceaccount.com',
            private_key: 'test-key',
        };

        createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
            credentials,
        });

        expect(googleGenAIConstructor).toHaveBeenCalledWith({
            vertexai: true,
            project: 'my-project',
            location: 'europe-west1',
            googleAuthOptions: { credentials },
        });
    });

    it('should not construct a Google SDK client when one is injected', () => {
        createGoogleVertex({ client: createMockClient() });

        expect(googleGenAIConstructor).not.toHaveBeenCalled();
    });

    it('should expose all model types with the google-vertex provider id', () => {
        const provider = createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        expect(provider.chatModel('gemini-2.5-flash').provider).toBe(
            'google-vertex'
        );
        expect(provider.embeddingModel('gemini-embedding-001').provider).toBe(
            'google-vertex'
        );
        expect(provider.imageModel('imagen-4.0-generate-001').provider).toBe(
            'google-vertex'
        );
    });

    it('should inherit unsupported strict tool schema capabilities', () => {
        const model = createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        }).chatModel('gemini-2.5-flash');

        expect(model.capabilities.tools.strictSchemas).toEqual({
            supported: false,
        });
    });

    it('should reject explicit strict tools locally with the Vertex provider id', async () => {
        const model = createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        }).chatModel('gemini-2.5-flash');

        const error = await model
            .generate({
                messages: [{ role: 'user', content: 'Search' }],
                tools: {
                    search: {
                        name: 'search',
                        description: 'Search the web',
                        parameters: z.object({ query: z.string() }),
                        strict: true,
                    },
                },
            })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ToolSchemaStrictnessError);
        expect(error).toMatchObject({
            provider: 'google-vertex',
            providerId: 'google-vertex',
            modelId: 'gemini-2.5-flash',
            toolNames: ['search'],
            reason: 'unsupported',
        });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('should read provider options from the google-vertex key only', async () => {
        generateContent.mockResolvedValue({ candidates: [] });
        embedContent.mockResolvedValue({ embeddings: [] });
        generateImages.mockResolvedValue({ generatedImages: [] });
        const provider = createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        await provider.chatModel('gemini-2.5-flash').generate({
            messages: [{ role: 'user', content: 'hello' }],
            providerOptions: {
                'google-vertex': { seed: 42 },
                google: { topK: 40 },
            },
        });
        await provider.embeddingModel('gemini-embedding-001').embed({
            input: 'hello',
            providerOptions: {
                'google-vertex': { taskType: 'RETRIEVAL_QUERY' },
                google: { title: 'ignored' },
            },
        });
        await provider.imageModel('imagen-4.0-generate-001').generate({
            prompt: 'a cat',
            providerOptions: {
                'google-vertex': { guidanceScale: 7 },
                google: { negativePrompt: 'ignored' },
            },
        });

        const [chatRequest] = generateContent.mock.calls[0] ?? [];
        expect(chatRequest.config).toMatchObject({ seed: 42 });
        expect(chatRequest.config).not.toHaveProperty('topK');
        expect(embedContent).toHaveBeenCalledWith(
            expect.objectContaining({
                config: { taskType: 'RETRIEVAL_QUERY' },
            })
        );
        expect(generateImages).toHaveBeenCalledWith(
            expect.objectContaining({ config: { guidanceScale: 7 } })
        );
    });

    it('should tag errors with provider "google-vertex"', async () => {
        generateContent.mockRejectedValue(new Error('upstream failure'));
        const provider = createGoogleVertex({
            projectId: 'my-project',
            region: 'europe-west1',
        });

        const error = await provider
            .chatModel('gemini-2.5-flash')
            .generate({ messages: [{ role: 'user', content: 'hello' }] })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('google-vertex');
    });
});

function createMockClient(): GoogleGenAIClient {
    return {
        models: {
            generateContent,
            generateContentStream,
            embedContent,
            generateImages,
        },
    } as unknown as GoogleGenAIClient;
}
