import type {
    EmbedProviderOptions,
    GenerateProviderOptions,
    ImageProviderOptions,
} from '@core-ai/core-ai';
import { z } from 'zod';

export const openaiResponsesGenerateProviderOptionsSchema = z
    .object({
        store: z.boolean().optional(),
        serviceTier: z
            .enum(['auto', 'default', 'flex', 'scale', 'priority'])
            .optional(),
        include: z.array(z.string()).optional(),
        parallelToolCalls: z.boolean().optional(),
        user: z.string().optional(),
    })
    .strict();

export type OpenAIResponsesGenerateProviderOptions = z.infer<
    typeof openaiResponsesGenerateProviderOptionsSchema
>;

export const openaiChatGenerateProviderOptionsSchema =
    openaiResponsesGenerateProviderOptionsSchema
        .omit({
            include: true,
        })
        .extend({
            stopSequences: z.array(z.string()).optional(),
            frequencyPenalty: z.number().optional(),
            presencePenalty: z.number().optional(),
            seed: z.number().int().optional(),
        })
        .strict();

export type OpenAIChatGenerateProviderOptions = z.infer<
    typeof openaiChatGenerateProviderOptionsSchema
>;

export const openaiEmbedProviderOptionsSchema = z
    .object({
        encodingFormat: z.enum(['float', 'base64']).optional(),
        user: z.string().optional(),
    })
    .strict();

export type OpenAIEmbedProviderOptions = z.infer<
    typeof openaiEmbedProviderOptionsSchema
>;

export const openaiImageProviderOptionsSchema = z
    .object({
        background: z.enum(['transparent', 'opaque', 'auto']).optional(),
        moderation: z.enum(['low', 'auto']).optional(),
        outputCompression: z.number().int().min(0).max(100).optional(),
        outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
        quality: z
            .enum(['standard', 'hd', 'low', 'medium', 'high', 'auto'])
            .optional(),
        responseFormat: z.enum(['url', 'b64_json']).optional(),
        style: z.enum(['vivid', 'natural']).optional(),
        user: z.string().optional(),
    })
    .strict();

export type OpenAIImageProviderOptions = z.infer<
    typeof openaiImageProviderOptionsSchema
>;

function parseOpenAIProviderOptions<TOptions>(
    providerOptions: { openai?: unknown } | undefined,
    schema: z.ZodType<TOptions>
): TOptions | undefined {
    const rawOptions = providerOptions?.openai;
    if (rawOptions === undefined) {
        return undefined;
    }

    return schema.parse(rawOptions);
}

export function parseOpenAIResponsesGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): OpenAIResponsesGenerateProviderOptions | undefined {
    return parseOpenAIProviderOptions(
        providerOptions,
        openaiResponsesGenerateProviderOptionsSchema
    );
}

export function parseOpenAIChatGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined
): OpenAIChatGenerateProviderOptions | undefined {
    return parseOpenAIProviderOptions(
        providerOptions,
        openaiChatGenerateProviderOptionsSchema
    );
}

export function parseOpenAIEmbedProviderOptions(
    providerOptions: EmbedProviderOptions | undefined
): OpenAIEmbedProviderOptions | undefined {
    return parseOpenAIProviderOptions(
        providerOptions,
        openaiEmbedProviderOptionsSchema
    );
}

export function parseOpenAIImageProviderOptions(
    providerOptions: ImageProviderOptions | undefined
): OpenAIImageProviderOptions | undefined {
    return parseOpenAIProviderOptions(
        providerOptions,
        openaiImageProviderOptionsSchema
    );
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        openai?:
            | OpenAIResponsesGenerateProviderOptions
            | OpenAIChatGenerateProviderOptions;
    }

    interface EmbedProviderOptions {
        openai?: OpenAIEmbedProviderOptions;
    }

    interface ImageProviderOptions {
        openai?: OpenAIImageProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const openaiResponsesProviderOptionsSchema =
    openaiResponsesGenerateProviderOptionsSchema;
export type OpenAIResponsesProviderOptions =
    OpenAIResponsesGenerateProviderOptions;

export const openaiCompatProviderOptionsSchema =
    openaiChatGenerateProviderOptionsSchema;
export const openaiCompatGenerateProviderOptionsSchema =
    openaiChatGenerateProviderOptionsSchema;
export type OpenAICompatGenerateProviderOptions =
    OpenAIChatGenerateProviderOptions;
export type OpenAICompatRequestOptions = OpenAIChatGenerateProviderOptions;

export const parseOpenAIResponsesProviderOptions =
    parseOpenAIResponsesGenerateProviderOptions;
export const parseOpenAICompatProviderOptions =
    parseOpenAIChatGenerateProviderOptions;
export const parseOpenAICompatGenerateProviderOptions =
    parseOpenAIChatGenerateProviderOptions;
