import type {
    EmbedProviderOptions,
    GenerateProviderOptions,
    ImageProviderOptions,
} from '@core-ai/core-ai';
import { z } from 'zod';

export const googleGenerateProviderOptionsSchema = z
    .object({
        stopSequences: z.array(z.string()).optional(),
        frequencyPenalty: z.number().optional(),
        presencePenalty: z.number().optional(),
        seed: z.number().int().optional(),
        topK: z.number().int().optional(),
    })
    .strict();

export type GoogleGenerateProviderOptions = z.infer<
    typeof googleGenerateProviderOptionsSchema
>;

export const googleEmbedProviderOptionsSchema = z
    .object({
        taskType: z.string().optional(),
        title: z.string().optional(),
        mimeType: z.string().optional(),
        autoTruncate: z.boolean().optional(),
    })
    .strict();

export type GoogleEmbedProviderOptions = z.infer<
    typeof googleEmbedProviderOptionsSchema
>;

export const googleImageProviderOptionsSchema = z
    .object({
        outputGcsUri: z.string().optional(),
        negativePrompt: z.string().optional(),
        aspectRatio: z.string().optional(),
        guidanceScale: z.number().optional(),
        seed: z.number().int().optional(),
        safetyFilterLevel: z
            .enum([
                'BLOCK_LOW_AND_ABOVE',
                'BLOCK_MEDIUM_AND_ABOVE',
                'BLOCK_ONLY_HIGH',
                'BLOCK_NONE',
            ])
            .optional(),
        personGeneration: z
            .enum(['DONT_ALLOW', 'ALLOW_ADULT', 'ALLOW_ALL'])
            .optional(),
        includeSafetyAttributes: z.boolean().optional(),
        includeRaiReason: z.boolean().optional(),
        language: z.string().optional(),
        outputMimeType: z.string().optional(),
        outputCompressionQuality: z.number().int().min(0).max(100).optional(),
        addWatermark: z.boolean().optional(),
        labels: z.record(z.string(), z.string()).optional(),
        imageSize: z.string().optional(),
        enhancePrompt: z.boolean().optional(),
    })
    .strict();

export type GoogleImageProviderOptions = z.infer<
    typeof googleImageProviderOptionsSchema
>;

export function parseGoogleGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): GoogleGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.google;
    if (rawOptions === undefined) {
        return undefined;
    }

    return googleGenerateProviderOptionsSchema.parse(rawOptions);
}

export function parseGoogleEmbedProviderOptions(
    providerOptions: EmbedProviderOptions | undefined
): GoogleEmbedProviderOptions | undefined {
    const rawOptions = providerOptions?.google;
    if (rawOptions === undefined) {
        return undefined;
    }

    return googleEmbedProviderOptionsSchema.parse(rawOptions);
}

export function parseGoogleImageProviderOptions(
    providerOptions: ImageProviderOptions | undefined
): GoogleImageProviderOptions | undefined {
    const rawOptions = providerOptions?.google;
    if (rawOptions === undefined) {
        return undefined;
    }

    return googleImageProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        google?: GoogleGenerateProviderOptions;
    }

    interface EmbedProviderOptions {
        google?: GoogleEmbedProviderOptions;
    }

    interface ImageProviderOptions {
        google?: GoogleImageProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const googleProviderOptionsSchema = googleGenerateProviderOptionsSchema;
export type GoogleProviderOptions = GoogleGenerateProviderOptions;
export const parseGoogleProviderOptions = parseGoogleGenerateProviderOptions;
