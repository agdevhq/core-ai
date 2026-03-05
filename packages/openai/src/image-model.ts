import type OpenAI from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from '@core-ai/core-ai';
import { wrapOpenAIError } from './openai-error.js';
import {
    parseOpenAIImageProviderOptions,
    type OpenAIImageProviderOptions,
} from './provider-options.js';

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
                const openaiOptions = parseOpenAIImageProviderOptions(
                    options.providerOptions
                );
                const request = {
                    model: modelId,
                    prompt: options.prompt,
                    ...(options.n !== undefined ? { n: options.n } : {}),
                    ...(options.size !== undefined
                        ? { size: options.size }
                        : {}),
                    ...mapOpenAIImageProviderOptionsToRequestFields(
                        openaiOptions
                    ),
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

function mapOpenAIImageProviderOptionsToRequestFields(
    options: OpenAIImageProviderOptions | undefined
) {
    return {
        ...(options?.background !== undefined
            ? { background: options.background }
            : {}),
        ...(options?.moderation !== undefined
            ? { moderation: options.moderation }
            : {}),
        ...(options?.outputCompression !== undefined
            ? { output_compression: options.outputCompression }
            : {}),
        ...(options?.outputFormat !== undefined
            ? { output_format: options.outputFormat }
            : {}),
        ...(options?.quality !== undefined ? { quality: options.quality } : {}),
        ...(options?.responseFormat !== undefined
            ? { response_format: options.responseFormat }
            : {}),
        ...(options?.style !== undefined ? { style: options.style } : {}),
        ...(options?.user !== undefined ? { user: options.user } : {}),
    };
}
