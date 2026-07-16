import { z } from 'zod';
import type { GenerateProviderOptions } from '@core-ai/core-ai';
import { openaiChatGenerateProviderOptionsSchema } from '@core-ai/openai';

export const kimiGenerateProviderOptionsSchema =
    openaiChatGenerateProviderOptionsSchema.pick({
        parallelToolCalls: true,
        stopSequences: true,
        seed: true,
        user: true,
    });

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
