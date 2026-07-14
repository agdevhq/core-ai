import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@core-ai/core-ai';
import type { GoogleGenAIClient } from '@core-ai/google-genai';

import { createGoogleGenAIVertex } from './provider.js';

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

describe('createGoogleGenAIVertex', () => {
    beforeEach(() => {
        googleGenAIConstructor.mockReset();
        generateContent.mockReset();
        generateContentStream.mockReset();
        embedContent.mockReset();
        generateImages.mockReset();
    });

    it('should throw when projectId is missing and no client is provided', () => {
        expect(() =>
            createGoogleGenAIVertex({ region: 'europe-west1' })
        ).toThrowError(/projectId is required/);
        expect(googleGenAIConstructor).not.toHaveBeenCalled();
    });

    it('should throw when region is missing and no client is provided', () => {
        expect(() =>
            createGoogleGenAIVertex({ projectId: 'my-project' })
        ).toThrowError(/region is required/);
    });

    it('should construct a Vertex AI client using Application Default Credentials by default', () => {
        createGoogleGenAIVertex({
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

        createGoogleGenAIVertex({
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

    it('should not construct a GoogleGenAI client when one is injected', () => {
        createGoogleGenAIVertex({ client: createMockClient() });

        expect(googleGenAIConstructor).not.toHaveBeenCalled();
    });

    it('should expose all model types with the google-vertex provider id', () => {
        const provider = createGoogleGenAIVertex({
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

    it('should tag errors with provider "google-vertex"', async () => {
        generateContent.mockRejectedValue(new Error('upstream failure'));
        const provider = createGoogleGenAIVertex({
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
