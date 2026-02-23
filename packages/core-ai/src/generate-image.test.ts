import { describe, expect, it, vi } from 'vitest';
import { LLMError } from './errors.ts';
import { generateImage } from './generate-image.ts';
import type { ImageModel } from './types.ts';

describe('generateImage', () => {
    it('should delegate to model.generate', async () => {
        const model: ImageModel = {
            provider: 'test',
            modelId: 'test-image',
            generate: vi.fn(async () => ({
                images: [{ base64: 'abc' }],
            })),
        };

        const result = await generateImage({
            model,
            prompt: 'a cat',
        });

        expect(result.images).toEqual([{ base64: 'abc' }]);
    });

    it('should throw for empty prompt', async () => {
        const model: ImageModel = {
            provider: 'test',
            modelId: 'test-image',
            generate: vi.fn(async () => ({ images: [] })),
        };

        await expect(
            generateImage({
                model,
                prompt: '',
            })
        ).rejects.toBeInstanceOf(LLMError);
    });
});
