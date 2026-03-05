import type { GenerateProviderOptions } from '@core-ai/core-ai';
import { z } from 'zod';

export const anthropicGenerateProviderOptionsSchema = z
    .object({
        topK: z.number().int().optional(),
        stopSequences: z.array(z.string()).optional(),
        betas: z.array(z.string()).optional(),
        outputConfig: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export type AnthropicGenerateProviderOptions = z.infer<
    typeof anthropicGenerateProviderOptionsSchema
>;

export function parseAnthropicGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): AnthropicGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.anthropic;
    if (rawOptions === undefined) {
        return undefined;
    }

    return anthropicGenerateProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        anthropic?: AnthropicGenerateProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const anthropicProviderOptionsSchema =
    anthropicGenerateProviderOptionsSchema;
export type AnthropicProviderOptions = AnthropicGenerateProviderOptions;
export const parseAnthropicProviderOptions =
    parseAnthropicGenerateProviderOptions;
