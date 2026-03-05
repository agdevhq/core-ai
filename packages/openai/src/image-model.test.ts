import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { createOpenAIImageModel } from './image-model.js';

describe('createOpenAIImageModel', () => {
    it('should map generated images', async () => {
        const generate = vi.fn(async () => ({
            data: [
                {
                    b64_json: 'abc123',
                    revised_prompt: 'a revised prompt',
                },
                {
                    url: 'https://example.com/image.png',
                },
            ],
        }));

        const model = createOpenAIImageModel(
            {
                images: { generate },
            } as unknown as Pick<OpenAI, 'images'>,
            'gpt-image-1'
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
                url: 'https://example.com/image.png',
                revisedPrompt: undefined,
            },
        ]);
    });

    it('should pass options through', async () => {
        const generate = vi.fn(async () => ({
            data: [],
        }));

        const model = createOpenAIImageModel(
            {
                images: { generate },
            } as unknown as Pick<OpenAI, 'images'>,
            'gpt-image-1'
        );

        await model.generate({
            prompt: 'A cat with a top hat',
            n: 2,
            size: '1024x1024',
            providerOptions: {
                openai: {
                    user: 'user-123',
                    quality: 'high',
                },
            },
        });

        expect(generate).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-image-1',
                prompt: 'A cat with a top hat',
                n: 2,
                size: '1024x1024',
                user: 'user-123',
                quality: 'high',
            })
        );
    });
});
