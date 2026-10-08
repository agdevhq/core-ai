import type {
    GenerateProviderOptions,
    SystemMessageProviderOptions,
} from '@core-ai/core-ai';
import { z } from 'zod';

export const anthropicCacheControlSchema = z
    .object({
        type: z.literal('ephemeral'),
        ttl: z.enum(['5m', '1h']).optional(),
    })
    .strict();

export type AnthropicCacheControl = z.infer<typeof anthropicCacheControlSchema>;

export const anthropicGenerateProviderOptionsSchema = z
    .object({
        topK: z.number().int().optional(),
        stopSequences: z.array(z.string()).optional(),
        betas: z.array(z.string()).optional(),
        outputConfig: z.record(z.string(), z.unknown()).optional(),
        cacheControl: anthropicCacheControlSchema.optional(),
    })
    .strict();

export type AnthropicGenerateProviderOptions = z.infer<
    typeof anthropicGenerateProviderOptionsSchema
>;

/**
 * Reads the options namespaced under `providerId` (`model.provider`), so
 * sibling providers such as `anthropic-vertex` own their key and ignore
 * options addressed to `anthropic`.
 */
export function parseAnthropicGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined,
    providerId: string
): AnthropicGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return anthropicGenerateProviderOptionsSchema.parse(rawOptions);
}

export const anthropicSystemMessageProviderOptionsSchema = z
    .object({
        cacheControl: anthropicCacheControlSchema.optional(),
    })
    .strict();

export type AnthropicSystemMessageProviderOptions = z.infer<
    typeof anthropicSystemMessageProviderOptionsSchema
>;

/**
 * Reads the system message options namespaced under `providerId`
 * (`model.provider`), like {@link parseAnthropicGenerateProviderOptions}.
 */
export function parseAnthropicSystemMessageProviderOptions(
    providerOptions: SystemMessageProviderOptions | undefined,
    providerId: string
): AnthropicSystemMessageProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return anthropicSystemMessageProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        anthropic?: AnthropicGenerateProviderOptions;
    }

    interface SystemMessageProviderOptions {
        anthropic?: AnthropicSystemMessageProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const anthropicProviderOptionsSchema =
    anthropicGenerateProviderOptionsSchema;
export type AnthropicProviderOptions = AnthropicGenerateProviderOptions;
export const parseAnthropicProviderOptions =
    parseAnthropicGenerateProviderOptions;
