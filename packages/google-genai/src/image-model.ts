import type {
    GenerateContentParameters,
    GenerateContentResponse,
} from '@google/genai';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from '@core-ai/core-ai';
import { wrapGoogleError } from './google-error.ts';
import {
    parseGoogleImageProviderOptions,
    type GoogleImageProviderOptions,
} from './provider-options.ts';
import type { GoogleGenAIClient } from './provider.ts';

export function createGoogleGenAIImageModel(
    client: GoogleGenAIClient,
    modelId: string,
    provider = 'google'
): ImageModel {
    return {
        provider,
        modelId,
        async generate(
            options: ImageGenerateOptions
        ): Promise<ImageGenerateResult> {
            try {
                const googleOptions = parseGoogleImageProviderOptions(
                    options.providerOptions,
                    provider
                );
                return await generateGeminiImages(
                    client,
                    modelId,
                    options,
                    googleOptions
                );
            } catch (error) {
                throw wrapGoogleError(error, provider);
            }
        },
    };
}

async function generateGeminiImages(
    client: GoogleGenAIClient,
    modelId: string,
    options: ImageGenerateOptions,
    googleOptions: GoogleImageProviderOptions | undefined
): Promise<ImageGenerateResult> {
    if (options.n !== undefined && options.n > 1) {
        throw new Error(
            'Gemini image generation does not support n greater than 1.'
        );
    }

    const sizeConfig = mapSizeToImageConfig(options.size);
    const aspectRatio = googleOptions?.aspectRatio ?? sizeConfig['aspectRatio'];
    const imageSize = supportsGeminiImageSize(modelId)
        ? (googleOptions?.imageSize ?? sizeConfig['imageSize'])
        : undefined;
    const imageConfig = {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
    };
    const request: GenerateContentParameters = {
        model: modelId,
        contents: [
            {
                role: 'user',
                parts: [{ text: options.prompt }],
            },
        ],
        config: {
            responseModalities: ['IMAGE'],
            ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
            ...(googleOptions?.seed !== undefined
                ? { seed: googleOptions.seed }
                : {}),
        },
    };
    const response = await client.models.generateContent(request);

    return mapGeminiImageResponse(response);
}

function supportsGeminiImageSize(modelId: string): boolean {
    return !modelId.startsWith('gemini-2.5-flash-image');
}

function mapGeminiImageResponse(
    response: GenerateContentResponse
): ImageGenerateResult {
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    return {
        images: parts.flatMap((part) => {
            const inlineData = part.inlineData;
            if (
                !inlineData?.data ||
                !inlineData.mimeType?.startsWith('image/')
            ) {
                return [];
            }

            return [{ base64: inlineData.data }];
        }),
    };
}

function mapSizeToImageConfig(
    size: string | undefined
): Record<string, string> {
    if (!size) {
        return {};
    }

    const match = /^(\d+)x(\d+)$/i.exec(size.trim());
    if (!match) {
        return {};
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0) {
        return {};
    }

    const aspectRatio = simplifyRatio(width, height);
    const largestDimension = Math.max(width, height);

    return {
        aspectRatio,
        ...(largestDimension <= 1024
            ? { imageSize: '1K' }
            : largestDimension <= 2048
              ? { imageSize: '2K' }
              : {}),
    };
}

function simplifyRatio(width: number, height: number): string {
    const divisor = greatestCommonDivisor(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function greatestCommonDivisor(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);

    while (y !== 0) {
        const remainder = x % y;
        x = y;
        y = remainder;
    }

    return x === 0 ? 1 : x;
}
