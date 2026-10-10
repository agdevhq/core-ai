import type {
    GenerateProviderOptions,
    SystemMessageProviderOptions,
    ToolResultMessageProviderOptions,
    UserMessageProviderOptions,
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

export const anthropicUserMessageProviderOptionsSchema = z
    .object({
        cacheControl: anthropicCacheControlSchema.optional(),
    })
    .strict();

export type AnthropicUserMessageProviderOptions = z.infer<
    typeof anthropicUserMessageProviderOptionsSchema
>;

export const anthropicToolResultMessageProviderOptionsSchema = z
    .object({
        cacheControl: anthropicCacheControlSchema.optional(),
    })
    .strict();

export type AnthropicToolResultMessageProviderOptions = z.infer<
    typeof anthropicToolResultMessageProviderOptionsSchema
>;

/**
 * Reads the system message options namespaced under `providerId`
 * (`model.provider`), like {@link parseAnthropicGenerateProviderOptions}.
 */
export function parseAnthropicSystemMessageProviderOptions(
    providerOptions: SystemMessageProviderOptions | undefined,
    providerId: string
): AnthropicSystemMessageProviderOptions | undefined {
    return parseMessageProviderOptions(
        anthropicSystemMessageProviderOptionsSchema,
        providerOptions,
        providerId
    );
}

/**
 * Reads the user message options namespaced under `providerId`
 * (`model.provider`), like {@link parseAnthropicGenerateProviderOptions}.
 */
export function parseAnthropicUserMessageProviderOptions(
    providerOptions: UserMessageProviderOptions | undefined,
    providerId: string
): AnthropicUserMessageProviderOptions | undefined {
    return parseMessageProviderOptions(
        anthropicUserMessageProviderOptionsSchema,
        providerOptions,
        providerId
    );
}

/**
 * Reads the tool result message options namespaced under `providerId`
 * (`model.provider`), like {@link parseAnthropicGenerateProviderOptions}.
 */
export function parseAnthropicToolResultMessageProviderOptions(
    providerOptions: ToolResultMessageProviderOptions | undefined,
    providerId: string
): AnthropicToolResultMessageProviderOptions | undefined {
    return parseMessageProviderOptions(
        anthropicToolResultMessageProviderOptionsSchema,
        providerOptions,
        providerId
    );
}

function parseMessageProviderOptions<TSchema extends z.ZodType>(
    schema: TSchema,
    providerOptions: Record<string, unknown> | undefined,
    providerId: string
): z.infer<TSchema> | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return schema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        anthropic?: AnthropicGenerateProviderOptions;
    }

    interface SystemMessageProviderOptions {
        anthropic?: AnthropicSystemMessageProviderOptions;
    }

    interface UserMessageProviderOptions {
        anthropic?: AnthropicUserMessageProviderOptions;
    }

    interface ToolResultMessageProviderOptions {
        anthropic?: AnthropicToolResultMessageProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const anthropicProviderOptionsSchema =
    anthropicGenerateProviderOptionsSchema;
export type AnthropicProviderOptions = AnthropicGenerateProviderOptions;
export const parseAnthropicProviderOptions =
    parseAnthropicGenerateProviderOptions;
