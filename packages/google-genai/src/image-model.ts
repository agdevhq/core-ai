import type { GenerateImagesParameters, GoogleGenAI } from '@google/genai';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from '@core-ai/core-ai';
import { wrapGoogleError } from './google-error.js';
import {
    parseGoogleImageProviderOptions,
    type GoogleImageProviderOptions,
} from './provider-options.js';

type GoogleGenAIImageClient = {
    models: GoogleGenAI['models'];
};

export function createGoogleGenAIImageModel(
    client: GoogleGenAIImageClient,
    modelId: string
): ImageModel {
    return {
        provider: 'google',
        modelId,
        async generate(
            options: ImageGenerateOptions
        ): Promise<ImageGenerateResult> {
            try {
                const baseRequest: GenerateImagesParameters = {
                    model: modelId,
                    prompt: options.prompt,
                    config: {
                        ...(options.n !== undefined
                            ? { numberOfImages: options.n }
                            : {}),
                        ...mapSizeToImageConfig(options.size),
                    },
                };
                const googleOptions = parseGoogleImageProviderOptions(
                    options.providerOptions
                );
                const providerConfig =
                    mapGoogleImageProviderOptionsToConfig(googleOptions);
                const request: GenerateImagesParameters =
                    Object.keys(providerConfig).length > 0
                        ? {
                              ...baseRequest,
                              config: {
                                  ...baseRequest.config,
                                  ...providerConfig,
                              },
                          }
                        : baseRequest;
                const response = await client.models.generateImages(request);

                return {
                    images: (response.generatedImages ?? []).map((image) => ({
                        base64: image.image?.imageBytes ?? undefined,
                        url: image.image?.gcsUri ?? undefined,
                        revisedPrompt: image.enhancedPrompt ?? undefined,
                    })),
                };
            } catch (error) {
                throw wrapGoogleError(error);
            }
        },
    };
}

function mapGoogleImageProviderOptionsToConfig(
    options: GoogleImageProviderOptions | undefined
): Record<string, unknown> {
    return {
        ...(options?.outputGcsUri !== undefined
            ? { outputGcsUri: options.outputGcsUri }
            : {}),
        ...(options?.negativePrompt !== undefined
            ? { negativePrompt: options.negativePrompt }
            : {}),
        ...(options?.aspectRatio !== undefined
            ? { aspectRatio: options.aspectRatio }
            : {}),
        ...(options?.guidanceScale !== undefined
            ? { guidanceScale: options.guidanceScale }
            : {}),
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
        ...(options?.safetyFilterLevel !== undefined
            ? { safetyFilterLevel: options.safetyFilterLevel }
            : {}),
        ...(options?.personGeneration !== undefined
            ? { personGeneration: options.personGeneration }
            : {}),
        ...(options?.includeSafetyAttributes !== undefined
            ? { includeSafetyAttributes: options.includeSafetyAttributes }
            : {}),
        ...(options?.includeRaiReason !== undefined
            ? { includeRaiReason: options.includeRaiReason }
            : {}),
        ...(options?.language !== undefined
            ? { language: options.language }
            : {}),
        ...(options?.outputMimeType !== undefined
            ? { outputMimeType: options.outputMimeType }
            : {}),
        ...(options?.outputCompressionQuality !== undefined
            ? { outputCompressionQuality: options.outputCompressionQuality }
            : {}),
        ...(options?.addWatermark !== undefined
            ? { addWatermark: options.addWatermark }
            : {}),
        ...(options?.labels !== undefined ? { labels: options.labels } : {}),
        ...(options?.imageSize !== undefined
            ? { imageSize: options.imageSize }
            : {}),
        ...(options?.enhancePrompt !== undefined
            ? { enhancePrompt: options.enhancePrompt }
            : {}),
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
