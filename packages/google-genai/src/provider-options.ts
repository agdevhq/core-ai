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
        aspectRatio: z.string().optional(),
        imageSize: z.string().optional(),
        seed: z.number().int().optional(),
    })
    .strict();

export type GoogleImageProviderOptions = z.infer<
    typeof googleImageProviderOptionsSchema
>;

// Parsers read the options namespaced under `providerId` (`model.provider`),
// so sibling providers such as `google-vertex` own their key and ignore
// options addressed to `google`.
export function parseGoogleGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined,
    providerId: string
): GoogleGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return googleGenerateProviderOptionsSchema.parse(rawOptions);
}

export function parseGoogleEmbedProviderOptions(
    providerOptions: EmbedProviderOptions | undefined,
    providerId: string
): GoogleEmbedProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return googleEmbedProviderOptionsSchema.parse(rawOptions);
}

export function parseGoogleImageProviderOptions(
    providerOptions: ImageProviderOptions | undefined,
    providerId: string
): GoogleImageProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
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
