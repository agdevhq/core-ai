import type { z } from 'zod';
import {
    openaiChatGenerateProviderOptionsSchema,
    openaiResponsesGenerateProviderOptionsSchema,
} from '@core-ai/openai';

export const xaiResponsesGenerateProviderOptionsSchema =
    openaiResponsesGenerateProviderOptionsSchema.pick({
        store: true,
        include: true,
        parallelToolCalls: true,
        user: true,
        promptCacheKey: true,
    });

// Stop sequences and penalties are omitted on purpose: xAI reasoning models
// reject them with HTTP 400.
export const xaiChatGenerateProviderOptionsSchema =
    openaiChatGenerateProviderOptionsSchema.pick({
        parallelToolCalls: true,
        seed: true,
        user: true,
    });

export type XAIResponsesGenerateProviderOptions = z.infer<
    typeof xaiResponsesGenerateProviderOptionsSchema
>;

export type XAIChatGenerateProviderOptions = z.infer<
    typeof xaiChatGenerateProviderOptionsSchema
>;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        xai?:
            | XAIResponsesGenerateProviderOptions
            | XAIChatGenerateProviderOptions;
    }
}

export type XAIReasoningMetadata = {
    encryptedContent?: string;
};
