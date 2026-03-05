import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { createGoogleGenAIImageModel } from './image-model.js';

describe('createGoogleGenAIImageModel', () => {
    it('should map generated images', async () => {
        const generateImages = vi.fn(async () => ({
            generatedImages: [
                {
                    image: {
                        imageBytes: 'abc123',
                    },
                    enhancedPrompt: 'a revised prompt',
                },
                {
                    image: {
                        gcsUri: 'gs://bucket/image.png',
                    },
                },
            ],
        }));

        const model = createGoogleGenAIImageModel(
            {
                models: { generateImages },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'imagen-4.0-generate-001'
        );

        const result = await model.generate({
            prompt: 'A cat with a top hat',
        });

        expect(result.images).toEqual([
            {
                base64: 'abc123',
                url: undefined,
                revisedPrompt: 'a revised prompt',
            },
            {
                base64: undefined,
                url: 'gs://bucket/image.png',
                revisedPrompt: undefined,
            },
        ]);
    });

    it('should pass options through', async () => {
        const generateImages = vi.fn(async () => ({
            generatedImages: [],
        }));

        const model = createGoogleGenAIImageModel(
            {
                models: { generateImages },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'imagen-4.0-generate-001'
        );

        await model.generate({
            prompt: 'A cat with a top hat',
            n: 2,
            size: '1024x1024',
            providerOptions: {
                google: {
                    config: {
                        guidanceScale: 7,
                    },
                },
            },
        });

        expect(generateImages).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'imagen-4.0-generate-001',
                prompt: 'A cat with a top hat',
                config: expect.objectContaining({
                    numberOfImages: 2,
                    aspectRatio: '1:1',
                    imageSize: '1K',
                    guidanceScale: 7,
                }),
            })
        );
    });
});
