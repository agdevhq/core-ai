import type { GenerateProviderOptions } from '@core-ai/core-ai';
import { z } from 'zod';

export const kimiGenerateProviderOptionsSchema = z
    .object({
        parallelToolCalls: z.boolean().optional(),
        stopSequences: z.array(z.string()).optional(),
        seed: z.number().int().optional(),
        user: z.string().optional(),
    })
    .strict();

export type KimiGenerateProviderOptions = z.infer<
    typeof kimiGenerateProviderOptionsSchema
>;

export function parseKimiGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): KimiGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.kimi;
    if (rawOptions === undefined) {
        return undefined;
    }

    return kimiGenerateProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        kimi?: KimiGenerateProviderOptions;
    }
}

export type KimiReasoningMetadata = Record<string, never>;
