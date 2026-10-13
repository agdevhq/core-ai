import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';

import { createGoogleGenAIImageModel } from './image-model.ts';

describe('createGoogleGenAIImageModel', () => {
    it('should generate Gemini images with generateContent', async () => {
        const generateContent = vi.fn(async () => ({
            candidates: [
                {
                    content: {
                        parts: [
                            { text: 'Here is the image.' },
                            {
                                inlineData: {
                                    data: 'first-image',
                                    mimeType: 'image/png',
                                },
                            },
                            {
                                inlineData: {
                                    data: 'second-image',
                                    mimeType: 'image/jpeg',
                                },
                            },
                        ],
                    },
                },
            ],
        }));
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-2.5-flash-image'
        );

        const result = await model.generate({
            prompt: 'A cat with a top hat',
        });

        expect(generateContent).toHaveBeenCalledWith({
            model: 'gemini-2.5-flash-image',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: 'A cat with a top hat' }],
                },
            ],
            config: {
                responseModalities: ['IMAGE'],
            },
        });
        expect(result.images).toEqual([
            { base64: 'first-image' },
            { base64: 'second-image' },
        ]);
    });

    it('should map image options to Gemini generateContent config', async () => {
        const generateContent = vi.fn(async () => ({
            candidates: [],
        }));
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-3-pro-image-preview'
        );

        await model.generate({
            prompt: 'A cat with a top hat',
            n: 1,
            size: '1024x1024',
            providerOptions: {
                google: {
                    aspectRatio: '16:9',
                    imageSize: '2K',
                    seed: 42,
                },
            },
        });

        expect(generateContent).toHaveBeenCalledWith({
            model: 'gemini-3-pro-image-preview',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: 'A cat with a top hat' }],
                },
            ],
            config: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: '16:9',
                    imageSize: '2K',
                },
                seed: 42,
            },
        });
    });

    it('should not send imageSize to Gemini 2.5 image models', async () => {
        const generateContent = vi.fn(async () => ({
            candidates: [],
        }));
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-2.5-flash-image'
        );

        await model.generate({
            prompt: 'A cat with a top hat',
            size: '2048x1152',
            providerOptions: {
                google: {
                    imageSize: '2K',
                },
            },
        });

        expect(generateContent).toHaveBeenCalledWith(
            expect.objectContaining({
                config: {
                    responseModalities: ['IMAGE'],
                    imageConfig: {
                        aspectRatio: '16:9',
                    },
                },
            })
        );
    });

    it('should reject multiple Gemini images before calling the SDK', async () => {
        const generateContent = vi.fn();
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-2.5-flash-image'
        );

        await expect(
            model.generate({
                prompt: 'A cat with a top hat',
                n: 2,
            })
        ).rejects.toThrow(/does not support n greater than 1/);
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('should wrap Gemini image errors with the configured provider id', async () => {
        const generateContent = vi.fn(async () => {
            throw new Error('upstream failure');
        });
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-2.5-flash-image',
            'google-vertex'
        );

        const error = await model
            .generate({ prompt: 'A cat with a top hat' })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).provider).toBe('google-vertex');
    });

    it('should send model ids without the gemini- prefix to generateContent', async () => {
        const generateContent = vi.fn(async () => ({ candidates: [] }));
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'nano-banana-pro-preview'
        );

        await model.generate({ prompt: 'A cat with a top hat' });

        expect(generateContent).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'nano-banana-pro-preview' })
        );
    });

    it.each([
        { providerId: 'google', foreignKey: 'google-vertex' },
        { providerId: 'google-vertex', foreignKey: 'google' },
    ])(
        'should read $providerId options and ignore the $foreignKey key',
        async ({ providerId, foreignKey }) => {
            const generateContent = vi.fn(async () => ({ candidates: [] }));
            const model = createGoogleGenAIImageModel(
                {
                    models: { generateContent },
                } as unknown as Pick<GoogleGenAI, 'models'>,
                'gemini-nano-banana-2.1',
                providerId
            );

            await model.generate({
                prompt: 'A cat with a top hat',
                providerOptions: {
                    [providerId]: { seed: 7 },
                    [foreignKey]: { aspectRatio: '16:9', unknown: true },
                },
            });

            expect(generateContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    config: { responseModalities: ['IMAGE'], seed: 7 },
                })
            );
        }
    );

    it.each([
        ['raw config', { config: { seed: 7 } }],
        ['Imagen-only options', { guidanceScale: 7 }],
    ])('should reject %s for images', async (_label, googleOptions) => {
        const generateContent = vi.fn();
        const model = createGoogleGenAIImageModel(
            {
                models: { generateContent },
            } as unknown as Pick<GoogleGenAI, 'models'>,
            'gemini-nano-banana-2.1'
        );
        const invalidProviderOptions = {
            google: googleOptions,
        } as Parameters<typeof model.generate>[0]['providerOptions'];

        await expect(
            model.generate({
                prompt: 'A cat with a top hat',
                providerOptions: invalidProviderOptions,
            })
        ).rejects.toThrow(/unrecognized_key/);
        expect(generateContent).not.toHaveBeenCalled();
    });
});
