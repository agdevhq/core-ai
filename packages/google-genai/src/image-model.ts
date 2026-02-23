import { ApiError } from '@google/genai';
import type { GenerateImagesParameters, GoogleGenAI } from '@google/genai';
import { ProviderError } from '@core-ai/core-ai';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from '@core-ai/core-ai';

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
                const providerOptions = options.providerOptions;
                const request: GenerateImagesParameters = providerOptions
                    ? {
                          ...baseRequest,
                          ...(providerOptions as Partial<GenerateImagesParameters>),
                          config: {
                              ...baseRequest.config,
                              ...(asObject(providerOptions['config']) as Record<
                                  string,
                                  unknown
                              >),
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
                throw wrapError(error);
            }
        },
    };
}

function wrapError(error: unknown): ProviderError {
    if (error instanceof ApiError) {
        return new ProviderError(error.message, 'google', error.status, error);
    }

    return new ProviderError(
        error instanceof Error ? error.message : String(error),
        'google',
        undefined,
        error
    );
}

function mapSizeToImageConfig(size: string | undefined): Record<string, string> {
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

function asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}
