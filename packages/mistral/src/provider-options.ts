import type {
    EmbedProviderOptions,
    GenerateProviderOptions,
} from '@core-ai/core-ai';
import { z } from 'zod';

export const mistralGenerateProviderOptionsSchema = z
    .object({
        stopSequences: z.array(z.string()).optional(),
        frequencyPenalty: z.number().optional(),
        presencePenalty: z.number().optional(),
        randomSeed: z.number().int().optional(),
        parallelToolCalls: z.boolean().optional(),
        promptMode: z.string().optional(),
        safePrompt: z.boolean().optional(),
    })
    .strict();

export type MistralGenerateProviderOptions = z.infer<
    typeof mistralGenerateProviderOptionsSchema
>;

export const mistralEmbedProviderOptionsSchema = z
    .object({
        outputDtype: z
            .enum(['float', 'int8', 'uint8', 'binary', 'ubinary'])
            .optional(),
        encodingFormat: z.enum(['float', 'base64']).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export type MistralEmbedProviderOptions = z.infer<
    typeof mistralEmbedProviderOptionsSchema
>;

export function parseMistralGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): MistralGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.mistral;
    if (rawOptions === undefined) {
        return undefined;
    }

    return mistralGenerateProviderOptionsSchema.parse(rawOptions);
}

export function parseMistralEmbedProviderOptions(
    providerOptions: EmbedProviderOptions | undefined
): MistralEmbedProviderOptions | undefined {
    const rawOptions = providerOptions?.mistral;
    if (rawOptions === undefined) {
        return undefined;
    }

    return mistralEmbedProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        mistral?: MistralGenerateProviderOptions;
    }

    interface EmbedProviderOptions {
        mistral?: MistralEmbedProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const mistralProviderOptionsSchema =
    mistralGenerateProviderOptionsSchema;
export type MistralProviderOptions = MistralGenerateProviderOptions;
export const parseMistralProviderOptions = parseMistralGenerateProviderOptions;
