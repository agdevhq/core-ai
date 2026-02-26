import type OpenAI from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from '@core-ai/core-ai';
import { wrapOpenAIError } from './openai-error.js';

type OpenAIImageClient = {
    images: OpenAI['images'];
};

export function createOpenAIImageModel(
    client: OpenAIImageClient,
    modelId: string
): ImageModel {
    return {
        provider: 'openai',
        modelId,
        async generate(
            options: ImageGenerateOptions
        ): Promise<ImageGenerateResult> {
            try {
                const request = {
                    model: modelId,
                    prompt: options.prompt,
                    ...(options.n !== undefined ? { n: options.n } : {}),
                    ...(options.size !== undefined
                        ? { size: options.size }
                        : {}),
                    ...options.providerOptions,
                };

                const response = (await client.images.generate(
                    request as never
                )) as ImagesResponse;

                return {
                    images: (response.data ?? []).map((image) => ({
                        base64: image.b64_json ?? undefined,
                        url: image.url ?? undefined,
                        revisedPrompt: image.revised_prompt ?? undefined,
                    })),
                };
            } catch (error) {
                throw wrapOpenAIError(error);
            }
        },
    };
}
