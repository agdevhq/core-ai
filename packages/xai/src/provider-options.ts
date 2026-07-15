import type { GenerateProviderOptions } from '@core-ai/core-ai';
import { z } from 'zod';

const jsonSchemaResponseFormatSchema = z
    .object({
        type: z.literal('json_schema'),
        json_schema: z.object({
            name: z.string(),
            description: z.string().optional(),
            schema: z.record(z.string(), z.unknown()),
            strict: z.boolean().optional(),
        }),
    })
    .strict();

export const xaiGenerateProviderOptionsSchema = z
    .object({
        parallelToolCalls: z.boolean().optional(),
        responseFormat: z
            .union([
                z.object({ type: z.literal('text') }).strict(),
                z.object({ type: z.literal('json_object') }).strict(),
                jsonSchemaResponseFormatSchema,
            ])
            .optional(),
        stopSequences: z.array(z.string()).optional(),
        frequencyPenalty: z.number().optional(),
        presencePenalty: z.number().optional(),
        seed: z.number().int().optional(),
        user: z.string().optional(),
        serviceTier: z.enum(['default', 'priority']).optional(),
        promptCacheKey: z.string().optional(),
    })
    .strict();

export type XAIGenerateProviderOptions = z.infer<
    typeof xaiGenerateProviderOptionsSchema
>;

export function parseXAIGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): XAIGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.xai;
    if (rawOptions === undefined) {
        return undefined;
    }

    return xaiGenerateProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        xai?: XAIGenerateProviderOptions;
    }
}

export type XAIReasoningMetadata = Record<string, never>;
